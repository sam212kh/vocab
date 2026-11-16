import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
    countsForPerformance,
    effortScore,
    evaluatedProductionEvidence,
    performanceEventFor,
    productionEvidence,
    stageCountsFrom,
    summarizeSession,
} from './journeyEvidence'
import { buildRoadmap } from './roadmap'
import { FIRST_ATTEMPT } from './productionAssistance'
import { useJourneyStore } from '../stores/journey'
import { planJourney } from './journeyPlanner'

import type { JourneyEvidenceRecord } from '../types/journey'
import type { SentenceEvaluation } from '../types/sentenceEvaluation'

const BASE = { sessionId: 's1', activityId: 'a1', kind: 'sentence-construction' as const, skill: 'writing' as const, itemKey: 'p1', timestamp: 1 }

function evaluation(overrides: Partial<SentenceEvaluation> = {}): SentenceEvaluation {
    const ok = { status: 'ok' as const, note: '' }

    return {
        schemaVersion: 'sentence-evaluation-v1',
        learnerSentence: 'She studies English every day.',
        outcome: 'correct', passed: true, issues: [],
        language: { correct: true, natural: true },
        content: { complete: true, meaningPreserved: true, relevant: true, targetUsed: true, usedTargets: ['every day'] },
        matchesReference: true,
        dimensions: { grammar: ok, meaning: ok, vocabulary: ok, wordOrder: ok, naturalness: ok, targetExpression: ok, contextRelevance: ok },
        errors: [], correctedSentence: '', explanationPersian: '', alternatives: [], example: '', nextPractice: '',
        ...overrides,
    }
}

const failing = evaluation({
    learnerSentence: 'She study English every day.',
    outcome: 'needs-correction', passed: false, issues: ['grammar', 'word-order'],
    language: { correct: false, natural: true }, matchesReference: false, correctedSentence: 'She studies English every day.',
})

function full(record: Omit<JourneyEvidenceRecord, 'id'>, index: number): JourneyEvidenceRecord {
    return { ...record, id: `ev-${index}` }
}

describe('AI-evaluated production evidence', () => {
    it('first unaided attempt that passes = independent production, AI-labelled, typed', () => {
        const record = evaluatedProductionEvidence(BASE, evaluation())

        expect(record).toMatchObject({ stage: 'production', correct: true, independent: true, assistance: 'none', evaluator: 'ai', modality: 'typed', attempt: 1, hintsUsed: 0 })
    })

    it('hint-assisted production is NOT independent', () => {
        const record = evaluatedProductionEvidence(BASE, evaluation(), { ...FIRST_ATTEMPT, hintUsed: true })

        expect(record.independent).toBe(false)
        expect(record.assistance).toBe('hint')
        expect(record.hintsUsed).toBe(1)
        expect(record.correct).toBe(true)
    })

    it('a failed first attempt is recorded as incorrect with its issues (and is independent: an honest miss)', () => {
        const record = evaluatedProductionEvidence(BASE, failing)

        expect(record.correct).toBe(false)
        expect(record.outcome).toBe('needs-correction')
        expect(record.issues).toEqual(['grammar', 'word-order'])
    })

    it('retry after feedback (correction hidden) = repeated practice, not independent', () => {
        const retry = evaluation({ learnerSentence: 'She studies English every day.' })
        const record = evaluatedProductionEvidence(BASE, retry, { attempt: 2, hintUsed: false, seenCorrection: null })

        expect(record.assistance).toBe('after-feedback')
        expect(record.independent).toBe(false)
        expect(record.attempt).toBe(2)
    })

    it('a corrected sentence copied after seeing it is NOT production evidence at all (correct=false, not independent)', () => {
        const copied = evaluation({ learnerSentence: 'She studies English every day.' })
        const record = evaluatedProductionEvidence(BASE, copied, { attempt: 2, hintUsed: false, seenCorrection: 'She studies English every day.' })

        expect(record.assistance).toBe('copied-correction')
        expect(record.independent).toBe(false)
        expect(record.correct).toBe(false)
    })

    it('evidence carries an outcome label only — never a score or a CEFR level', () => {
        const record = evaluatedProductionEvidence(BASE, evaluation()) as unknown as Record<string, unknown>

        for (const key of ['score', 'level', 'cefr', 'cefrLevel', 'band']) expect(key in record).toBe(false)
    })
})

describe('deterministic fallback evidence is labelled and honest', () => {
    it('labelled deterministic, no AI outcome/issues fabricated', () => {
        const record = productionEvidence(BASE, 'I put the kettle on every day.', ['kettle'])

        expect(record.evaluator).toBe('deterministic')
        expect(record.outcome).toBeUndefined()
        expect(record.issues).toBeUndefined()
        expect(record.independent).toBe(true)
        expect(record.correct).toBe(true)
    })

    it('hint demotes deterministic production too; missing target / too short stays incorrect', () => {
        expect(productionEvidence(BASE, 'I put the kettle on.', ['kettle'], { ...FIRST_ATTEMPT, hintUsed: true }).independent).toBe(false)
        expect(productionEvidence(BASE, 'Tea is hot today friend.', ['kettle']).correct).toBe(false)
        expect(productionEvidence(BASE, 'kettle', ['kettle']).correct).toBe(false)
        expect(productionEvidence(BASE, '', ['kettle']).correct).toBe(false)
    })

    it('copied correction is never correct on the deterministic path either', () => {
        const record = productionEvidence(BASE, 'I put the kettle on now.', ['kettle'], { attempt: 2, hintUsed: false, seenCorrection: 'I put the kettle on now.' })

        expect(record.correct).toBe(false)
        expect(record.independent).toBe(false)
    })
})

describe('typed answers never create Speaking evidence', () => {
    it('AI-evaluated and deterministic production map to non-speaking performance events', () => {
        for (const record of [evaluatedProductionEvidence(BASE, evaluation()), productionEvidence(BASE, 'I put the kettle on.', ['kettle'])]) {
            expect(performanceEventFor(record).skill).not.toBe('speaking')
        }
    })

    it('even a mis-tagged speaking skill with typed modality is remapped away from speaking', () => {
        const record = { ...evaluatedProductionEvidence(BASE, evaluation()), skill: 'speaking' as const }

        expect(performanceEventFor(record).skill).toBe('vocabulary')
    })

    it('AI issues become precise error categories; first attempts only feed skill stats', () => {
        const record = evaluatedProductionEvidence(BASE, failing)

        expect(performanceEventFor(record).errorCategories).toEqual(['grammar', 'word-order'])
        expect(countsForPerformance(record)).toBe(true)
        expect(countsForPerformance(evaluatedProductionEvidence(BASE, failing, { attempt: 2, hintUsed: false, seenCorrection: null }))).toBe(false)
        expect(countsForPerformance(evaluatedProductionEvidence(BASE, evaluation(), { attempt: 2, hintUsed: false, seenCorrection: 'She studies English every day.' }))).toBe(false)
    })

    it('meaning / off-topic / incomplete map to task-constraints, not a grammar claim', () => {
        const meaning = evaluatedProductionEvidence(BASE, evaluation({ passed: false, outcome: 'meaning-changed', issues: ['meaning'] }))

        expect(performanceEventFor(meaning).errorCategories).toEqual(['task-constraints'])
    })
})

describe('stage counts, roadmap, effort and summary respect independence', () => {
    const independent = full(evaluatedProductionEvidence(BASE, evaluation()), 1)
    const hinted = full(evaluatedProductionEvidence(BASE, evaluation(), { ...FIRST_ATTEMPT, hintUsed: true }), 2)
    const retried = full(evaluatedProductionEvidence(BASE, evaluation(), { attempt: 2, hintUsed: false, seenCorrection: null }), 3)
    const copied = full(evaluatedProductionEvidence(BASE, evaluation(), { attempt: 2, hintUsed: false, seenCorrection: 'She studies English every day.' }), 4)

    it('only independent correct production counts toward the planner stage balance', () => {
        expect(stageCountsFrom([independent]).production).toBe(1)
        expect(stageCountsFrom([hinted, retried, copied]).production).toBe(0)
    })

    it('legacy production records (no assistance field, independent:true) still count', () => {
        const legacy = full({ ...BASE, stage: 'production', correct: true, independent: true, hintsUsed: 0, modality: 'typed', completeness: 1 }, 9)

        expect(stageCountsFrom([legacy]).production).toBe(1)
    })

    it('roadmap progress rises for independent sentences but not for assisted ones', () => {
        const many = (record: Omit<JourneyEvidenceRecord, 'id'>) => Array.from({ length: 8 }, (_, index) => full(record, index))
        const input = (evidence: JourneyEvidenceRecord[]) => ({ evidence, completedJourneys: 0, availableSources: ['vocabulary', 'real-life'] as ('vocabulary' | 'real-life')[] })
        const stage = (evidence: JourneyEvidenceRecord[]) => buildRoadmap(input(evidence)).find(item => item.id === 'daily-communication')!.progress

        const independentProgress = stage(many(evaluatedProductionEvidence(BASE, evaluation())))
        const assistedProgress = stage(many(evaluatedProductionEvidence(BASE, evaluation(), { attempt: 2, hintUsed: false, seenCorrection: null })))

        expect(independentProgress).toBeGreaterThan(assistedProgress)
    })

    it('effort: copying a correction earns minimal credit; independent success earns full production credit', () => {
        expect(effortScore([independent])).toBe(4)
        expect(effortScore([copied])).toBe(1)
    })

    it('summary separates independent / hint / after-feedback / copied and AI vs basic-check', () => {
        const basic = full(productionEvidence(BASE, 'I put the kettle on every day.', ['kettle']), 5)
        const summary = summarizeSession([independent, hinted, retried, copied, basic], 1, 1, [])

        expect(summary.production).toEqual({
            independent: 2, // the AI one and the deterministic one (both unaided + correct)
            hintAssisted: 1,
            afterFeedback: 1,
            copiedCorrection: 1,
            aiEvaluated: 4,
            basicCheckOnly: 1,
        })
        expect(summary.productiveAttempts).toBe(4)
    })
})

describe('journey store persists the new evidence fields; legacy records still load', () => {
    beforeEach(() => setActivePinia(createPinia()))

    function plan() {
        return planJourney({
            length: 'standard', dueWords: [], newWords: [], dueGrammarTopics: [], grammarExercises: [],
            themes: [{
                id: 't', title: 't', titlePersian: 't',
                expressions: [{ english: 'put the kettle on', persian: 'x', example: 'e' }],
                exercises: [], speakingSentences: ['x'],
                constructionPrompt: { id: 'c', promptPersian: 'p', promptEnglish: 'Describe', targetExpressions: ['kettle'], modelSentences: ['m'] },
            }],
            dictationExercises: [], careerQuestions: [], recurringMistakeCategories: [], weakSkills: [],
            recentlyCompleted: [], speakingEnabled: false, stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
        })
    }

    it('round-trips evaluator/assistance/attempt/outcome through localStorage', () => {
        const store = useJourneyStore()
        const session = store.startSession(plan())

        store.addEvidence(session.id, evaluatedProductionEvidence({ ...BASE, sessionId: session.id }, failing))

        setActivePinia(createPinia())
        const reloaded = useJourneyStore()

        expect(reloaded.evidence[0]).toMatchObject({ evaluator: 'ai', assistance: 'none', attempt: 1, outcome: 'needs-correction', issues: ['grammar', 'word-order'] })
    })
})
