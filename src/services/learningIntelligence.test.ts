import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts } from './evidenceEngine'
import { computeIntelligence } from './learningIntelligence'
import { planJourney } from './journeyPlanner'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'
import type { TransferPattern } from '../types/transfer'

const NOW = 500 * DAY_MS

const entry = (daysAgo: number, mode: EvidenceMode, ok: boolean | null, over: Partial<EvidenceEntry> = {}): EvidenceEntry => ({ t: NOW - daysAgo * DAY_MS, mode, ok, independent: true, verified: true, ...over })
const item = (key: string, entries: EvidenceEntry[]): ItemEvidence => ({ key, kind: 'word', firstSeenAt: entries[0]?.t ?? 0, lastAt: entries.at(-1)?.t ?? 0, counts: emptyCounts(), exposures: 0, entries })

const PATTERN: TransferPattern = {
    id: 'polite-request', title: 'Polite requests', titlePersian: 'ی', frame: 'f', matches: ['\\bcould we get\\b', "\\bi'?d like\\b"],
    contexts: [{ id: 'c1', level: 1, situation: 'S.', situationPersian: 'ی', goal: 'G.', goalPersian: 'ی', targetPhrases: ['could'], references: ['Could I?'] }],
}

describe('computeIntelligence', () => {
    it('derives planner evidence from the ledger: introduced items, stages, retention-due and transfer', () => {
        const items = [
            item('lex:could we get the bill?', [entry(9, 'recall', true), entry(8, 'recall', true), entry(7, 'recall', true)]),
            item('lex:let it steep', [entry(2, 'view', null)]),
            item('lex:old word', [entry(20, 'recall', true), entry(10, 'recall', false)]),
        ]
        const result = computeIntelligence({ now: NOW, items, events: [], srs: [], patterns: [PATTERN] })

        expect(result.plannerEvidence.introduced.sort()).toEqual(['could we get the bill?', 'let it steep', 'old word'])
        expect(result.plannerEvidence.stages['could we get the bill?']).toBe('recalled')
        expect(result.plannerEvidence.stages['let it steep']).toBe('exposed')
        expect(result.plannerEvidence.retentionDue).toContain('old word')
        expect(result.plannerEvidence.transfer.task).toMatchObject({ patternId: 'polite-request', anchorExpression: 'could we get the bill?' })
        expect(result.plannerEvidence.transfer.task?.matches).toEqual(PATTERN.matches)
    })

    it('no ledger yet → planner evidence is empty and honest (nothing introduced, no transfer, all dimensions insufficient)', () => {
        const result = computeIntelligence({ now: NOW, items: [], events: [], srs: [], patterns: [PATTERN] })

        expect(result.plannerEvidence.introduced).toEqual([])
        expect(result.plannerEvidence.transfer).toEqual({ task: null, reason: 'no-acquired-expression' })
        expect(result.gaps.dimensions.every(d => d.classification === 'insufficient')).toBe(true)
        expect(result.retention.tracked).toBe(0)
    })

    it('feeds the planner end to end: a fresh learner is introduced to phrases before recall; a learner with recall evidence gets a transfer step', () => {
        const theme = {
            id: 't', title: 'Restaurant', titlePersian: 'ی',
            expressions: [{ english: 'Could we get the bill?', persian: 'ی', example: 'e', examplePersian: 'ی' }, { english: 'keep the change', persian: 'ی', example: 'e', examplePersian: 'ی' }],
            exercises: [], speakingSentences: [],
            constructionPrompt: { id: 'c', promptPersian: 'p', promptEnglish: 'Describe', targetExpressions: ['bill'], modelSentences: ['m'] },
        }
        const base = { length: 'standard' as const, dueWords: [], newWords: [], dueGrammarTopics: [], grammarExercises: [], themes: [theme], dictationExercises: [], careerQuestions: [], recurringMistakeCategories: [], weakSkills: [], recentlyCompleted: [], speakingEnabled: false, stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 } }

        const fresh = planJourney({ ...base, evidence: computeIntelligence({ now: NOW, items: [], events: [], srs: [], patterns: [PATTERN] }).plannerEvidence })

        expect(fresh.activities[0].kind).toBe('new-material-intro')

        const learner = [item('lex:could we get the bill?', [entry(9, 'recall', true), entry(8, 'recall', true)]), item('lex:keep the change', [entry(1, 'view', null)])]
        const adapted = planJourney({ ...base, evidence: computeIntelligence({ now: NOW, items: learner, events: [], srs: [], patterns: [PATTERN] }).plannerEvidence })

        expect(adapted.activities.map(a => a.kind)).toContain('contextual-application')
    })
})
