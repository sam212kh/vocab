import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AIClientError } from './aiClient'
import { backfillLedger } from './evidenceMigration'
import { DAY_MS, summarizeItem } from './evidenceEngine'
import { evidenceFromJourney } from './evidenceBridge'
import { planJourney } from './journeyPlanner'
import { loadContentSnapshot } from './journeyContent'
import { computeIntelligence } from './learningIntelligence'
import { requestSentenceEvaluation } from './sentenceEvaluation'
import { vocabularyMastery } from './vocabularyMastery'
import { LEDGER_KEY, migrateStored, useLearningEvidenceStore } from '../stores/learningEvidence'

import type { WordProgress } from '../types/vocabulary'
import type { SentenceEvaluationRequest } from '../types/sentenceEvaluation'
import type { PlannerInput } from '../types/journey'

const NOW = 600 * DAY_MS

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

const legacyWord = (id: string, over: Partial<WordProgress> = {}): WordProgress => ({
    wordId: id, courseId: 'upgrade', lessonId: 'batch-01', status: 'mastered', level: 1, pos: 'noun', correctAnswers: 30, wrongAnswers: 1,
    streak: 8, lastReviewedAt: NOW - DAY_MS, nextReviewAt: NOW - 1000, practicePriority: 1, easeFactor: 2.5, intervalDays: 30, ...over,
} as WordProgress)

describe('legacy data (before the ledger existed)', () => {
    it('an SRS-"mastered" word with 30 recorded corrects is NOT shown as recalled, produced or retained', () => {
        const items = backfillLedger({ journeyEvidence: [], wordProgress: [legacyWord('abandon')] })
        const ledger = Object.values(items)
        const summary = summarizeItem(ledger[0], NOW)

        expect(summary.stage).toBe('exposed')
        expect(summary.independentSuccesses).toBe(0)

        const intelligence = computeIntelligence({ now: NOW, items: ledger, events: [], srs: [{ key: 'lex:abandon', status: 'mastered', nextReviewAt: NOW - 1000 }], patterns: [] })

        expect(intelligence.retention.tracked).toBe(0)
        expect(intelligence.retention.srsOptimistic).toContain('lex:abandon')
        expect(intelligence.gaps.dimensions.every(dimension => dimension.classification === 'insufficient')).toBe(true)
    })

    it('legacy-only words are reported as "practised earlier", not as learned', () => {
        const ledger = Object.values(backfillLedger({ journeyEvidence: [], wordProgress: [legacyWord('a'), legacyWord('b')] }))
        const summaries = computeIntelligence({ now: NOW, items: ledger, events: [], srs: [], patterns: [] }).summaries
        const mastery = vocabularyMastery(summaries, new Set(), new Set(ledger.map(item => item.key)))

        expect(mastery.independentlyRecalled).toBe(0)
        expect(mastery.independentlyProduced).toBe(0)
        expect(mastery.practisedEarlier).toBe(2)
    })

    it('backfill twice is idempotent in the store (never doubles history)', () => {
        const store = useLearningEvidenceStore()
        const build = () => backfillLedger({ journeyEvidence: [], wordProgress: [legacyWord('abandon')] })

        store.adoptBackfill(build())
        const first = JSON.stringify(store.items)

        store.adoptBackfill(build())

        expect(JSON.stringify(store.items)).toBe(first)
    })

    it('real progress made after the backfill is kept when backfill runs', () => {
        const store = useLearningEvidenceStore()

        store.record({ key: 'lex:abandon', kind: 'word', mode: 'recall', ok: true, at: NOW })
        store.adoptBackfill(backfillLedger({ journeyEvidence: [], wordProgress: [legacyWord('abandon')] }))

        expect(store.items['lex:abandon'].counts.recall.independentSuccess).toBe(1)
        expect(store.items['lex:abandon'].legacy).toEqual({ correct: 30, wrong: 1 })
    })
})

describe('corrupt or foreign storage never crashes', () => {
    const GARBAGE: unknown[] = [
        null, undefined, 0, 1, 'x', true, [], [1, 2], {}, { items: null }, { items: [] }, { items: 'x' },
        { items: { a: null } }, { items: { a: 5 } }, { items: { a: { entries: 'x' } } },
        { items: { a: { entries: [null, 1, {}, { t: 'x' }, { t: NaN, mode: 'recall' }, { t: 1, mode: 'nope', ok: true }] } } },
        { items: { a: { counts: { recall: { attempts: -5, independentSuccess: 'x' } }, exposures: -3 } } },
    ]

    it.each(GARBAGE.map((value, index) => [index, value]))('migrateStored(#%i)', (_index, value) => {
        const state = migrateStored(value)

        expect(typeof state.items).toBe('object')

        for (const item of Object.values(state.items)) {
            expect(Array.isArray(item.entries)).toBe(true)
            for (const entry of item.entries) {
                expect(Number.isFinite(entry.t)).toBe(true)
                expect(['view', 'recognition', 'recall', 'production', 'application']).toContain(entry.mode)
            }
            expect(item.exposures).toBeGreaterThanOrEqual(0)

            const summary = summarizeItem(item, NOW)

            expect(Number.isFinite(summary.confidence)).toBe(true)
        }
    })

    it('a store loads from unparseable JSON as an empty ledger', () => {
        localStorage.setItem(LEDGER_KEY, '{{{ not json')

        expect(Object.keys(useLearningEvidenceStore().items)).toEqual([])
    })

    it('a stored ledger whose entries carry a bogus independence flag is treated as not independent', () => {
        const state = migrateStored({ items: { 'lex:a': { entries: [{ t: NOW, mode: 'recall', ok: true, independent: 'yes', verified: 'yes' }] } } })
        const entry = state.items['lex:a'].entries[0]

        expect(entry.independent).toBe(false)
        expect(summarizeItem(state.items['lex:a'], NOW).independentSuccesses).toBe(0)
    })
})

describe('AI failure and invalid AI output', () => {
    const request = { learnerSentence: 'Could we get the bill please?' } as SentenceEvaluationRequest

    it.each([
        ['gateway down', () => Promise.reject(new AIClientError('gateway-unreachable', 'secret server text'))],
        ['timeout', () => Promise.reject(new AIClientError('timeout', ''))],
        ['non-AI error', () => Promise.reject(new Error('boom'))],
        ['empty object', () => Promise.resolve({} as never)],
        ['evaluation missing dimensions', () => Promise.resolve({ evaluation: { schemaVersion: 1, learnerSentence: 'x', outcome: 'correct', passed: true, issues: [], errors: [] } } as never)],
        ['passed is a string', () => Promise.resolve({ evaluation: { passed: 'yes' } } as never)],
        ['null response', () => Promise.resolve(null as never)],
    ])('%s → unavailable, never throws, never claims a pass, never leaks server text', async (_name, evaluator) => {
        const result = await requestSentenceEvaluation(evaluator, request)

        expect(result.source).toBe('unavailable')
        if (result.source === 'unavailable') expect(result.message).not.toMatch(/secret|boom/)
    })

    it('a transfer answer judged only by the basic check is recorded UNVERIFIED and can never reach "applied"', () => {
        const store = useLearningEvidenceStore()
        const contexts = ['c1', 'c2', 'c3', 'c4']

        contexts.forEach((contextId, index) => {
            const inputs = evidenceFromJourney({
                stage: 'production', kind: 'contextual-application', skill: 'writing', itemKey: 'x', correct: true, independent: true, hintsUsed: 0, modality: 'typed',
                timestamp: NOW - (contexts.length - index) * 2 * DAY_MS, evaluator: 'deterministic', transfer: { patternId: 'polite-request', contextId },
            })

            expect(inputs.every(input => input.verified === false)).toBe(true)
            store.recordMany(inputs)
        })

        const summary = store.summaryFor('pattern:polite-request')

        expect(summary?.stage).not.toBe('applied')
        expect(summary?.independentSuccesses ?? 0).toBe(0)
    })
})

describe('offline: content cannot be loaded', () => {
    it('the snapshot resolves with empty sources and the planner says so instead of inventing content', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))

        const snapshot = await loadContentSnapshot(new Set(), [])

        expect(snapshot.transferPatterns).toEqual([])
        expect(snapshot.themes).toEqual([])
        expect(snapshot.availableSources).toEqual([])

        const input: PlannerInput = {
            length: 'standard', dueWords: [], newWords: snapshot.newWords, dueGrammarTopics: [], grammarExercises: snapshot.grammarExercises, themes: snapshot.themes,
            dictationExercises: snapshot.dictationExercises, careerQuestions: snapshot.careerQuestions, recurringMistakeCategories: [], weakSkills: [], recentlyCompleted: [],
            speakingEnabled: true, stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
            evidence: computeIntelligence({ now: NOW, items: [], events: [], srs: [], patterns: snapshot.transferPatterns }).plannerEvidence,
        }
        const plan = planJourney(input)

        expect(plan.activities.some(activity => activity.kind === 'contextual-application')).toBe(false)
        expect(plan.activities.some(activity => activity.kind === 'new-material-intro')).toBe(false)
        expect(plan.notes.length).toBeGreaterThan(0)
    })

    it('a missing transfer file alone does not disturb the rest of the snapshot', async () => {
        vi.stubGlobal('fetch', vi.fn((url: string) => (String(url).includes('transfer') ? Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('no')) }) : Promise.reject(new TypeError('offline')))))

        await expect(loadContentSnapshot(new Set(), [])).resolves.toMatchObject({ transferPatterns: [] })
    })
})
