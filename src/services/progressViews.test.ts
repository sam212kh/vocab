import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts } from './evidenceEngine'
import { MIN_TOTAL_OBSERVATIONS, generateInsights } from './insights'
import { buildProgressOverview } from './progressOverview'
import { analyzeSkillGaps } from './skillGap'
import { buildRetentionReport } from './retention'
import { summarizeItem } from './evidenceEngine'
import { vocabularyMastery, vocabularyMasteryStage } from './vocabularyMastery'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'
import type { JourneySession } from '../types/journey'
import type { PerformanceEvent } from '../types/performance'

const NOW = 600 * DAY_MS

const e = (daysAgo: number, mode: EvidenceMode, ok: boolean | null, over: Partial<EvidenceEntry> = {}): EvidenceEntry => ({ t: NOW - daysAgo * DAY_MS, mode, ok, independent: true, verified: true, ...over })
const item = (key: string, entries: EvidenceEntry[]): ItemEvidence => ({ key, kind: 'word', firstSeenAt: entries[0]?.t ?? 0, lastAt: entries.at(-1)?.t ?? 0, counts: emptyCounts(), exposures: 0, entries })

describe('vocabulary mastery categories', () => {
    const items = [
        item('lex:seen', [e(1, 'view', null)]),
        item('lex:learning', [e(3, 'recognition', true), e(2, 'recognition', true), e(1, 'recognition', true)]),
        item('lex:recalled', [e(4, 'recall', true), e(2, 'recall', true)]),
        item('lex:produced', [e(9, 'recall', true), e(8, 'recall', true), e(7, 'production', true, { ctx: 'a' }), e(6, 'production', true, { ctx: 'b' })]),
        item('lex:applied', [e(9, 'recall', true), e(8, 'recall', true), e(7, 'production', true, { ctx: 'a' }), e(6, 'production', true, { ctx: 'b' }), e(3, 'application', true, { ctx: 'x' }), e(2, 'application', true, { ctx: 'y' })]),
        item('exercise:not-vocab', [e(1, 'recognition', true)]),
    ]
    const summaries = items.map(i => summarizeItem(i, NOW))

    it('places each lexical item in exactly one stage category; exercises are excluded', () => {
        const result = vocabularyMastery(summaries, new Set())

        expect(result).toMatchObject({ total: 5, newlyIntroduced: 1, currentlyLearning: 1, independentlyRecalled: 1, independentlyProduced: 1, usedInNewContexts: 1 })
        expect(result.newlyIntroduced + result.currentlyLearning + result.independentlyRecalled + result.independentlyProduced + result.usedInNewContexts + result.practisedEarlier).toBe(result.total)
    })

    it('"due for review" is an overlay from the SRS, not a stage', () => {
        const result = vocabularyMastery(summaries, new Set(['lex:recalled', 'lex:seen']))

        expect(result.dueForReview).toBe(2)
        expect(result.independentlyRecalled).toBe(1)
    })

    it('legacy-only items (seen before evidence existed) are reported separately, not guessed', () => {
        const result = vocabularyMastery(summaries, new Set(), new Set(['lex:seen']))

        expect(result.practisedEarlier).toBe(1)
        expect(result.newlyIntroduced).toBe(0)
    })

    it('SRS "mastered" never moves an item up: only evidence does', () => {
        expect(vocabularyMastery([summarizeItem(item('lex:srs-mastered', [e(1, 'view', null)]), NOW)], new Set()).independentlyRecalled).toBe(0)
    })

    it('maps evidence to honest learner-facing stages with due as an overlay', () => {
        expect(vocabularyMasteryStage(null, false)).toBe('new')
        expect(vocabularyMasteryStage(summaries[0], false)).toBe('introduced')
        expect(vocabularyMasteryStage(summaries[2], false)).toBe('recalled-independently')
        expect(vocabularyMasteryStage(summaries[2], true)).toBe('due-for-review')
        expect(vocabularyMasteryStage(summaries[4], false)).toBe('consistently-retained')
    })
})

describe('progress overview from real sessions', () => {
    const session = (id: string, daysAgo: number, minutes: number, done: number, total = 5): JourneySession => ({
        id, startedAt: NOW - daysAgo * DAY_MS, completedAt: NOW - daysAgo * DAY_MS + minutes * 60000, currentIndex: 0,
        evidenceIds: [], statuses: Object.fromEntries(Array.from({ length: total }, (_, i) => [`a${i}`, i < done ? 'completed' : 'skipped'])),
        plan: { length: 'standard', objective: `Objective ${id}`, theme: null, activities: Array.from({ length: total }, (_, i) => ({ id: `a${i}` }) as never), totalEstimatedMinutes: 18, notes: [] },
    })

    it('counts completed sessions, learning time and weekly activity', () => {
        const overview = buildProgressOverview([session('a', 1, 20, 4), session('b', 2, 15, 5), session('c', 9, 30, 3), session('d', 20, 10, 2)], NOW)

        expect(overview.completedSessions).toBe(4)
        expect(overview.minutesInJourneys).toBe(75)
        expect(overview.perWeek).toEqual([2, 1, 1, 0])
        expect(overview.recent[0]).toMatchObject({ id: 'a', completedActivities: 4, totalActivities: 5, minutes: 20 })
    })

    it('an unfinished journey is not a completed session and adds no time', () => {
        const open: JourneySession = { ...session('o', 0, 0, 0), completedAt: null }

        expect(buildProgressOverview([open], NOW)).toMatchObject({ completedSessions: 0, minutesInJourneys: 0 })
    })

    it('a session left open for hours is capped (idle time is not learning time)', () => {
        expect(buildProgressOverview([session('long', 1, 600, 5)], NOW).minutesInJourneys).toBe(90)
    })

    it('no sessions → zeros, no invented activity', () => {
        expect(buildProgressOverview([], NOW)).toEqual({ completedSessions: 0, minutesInJourneys: 0, perWeek: [0, 0, 0, 0], recent: [] })
    })
})

describe('insights come from evidence and explain themselves', () => {
    const event = (skill: PerformanceEvent['skill'], daysAgo: number, ok: boolean): PerformanceEvent => ({ id: `${skill}${daysAgo}${ok}${Math.random()}`, skill, activityId: 'x', lessonId: null, timestamp: NOW - daysAgo * DAY_MS, difficulty: null, result: ok ? 'correct' : 'incorrect', attemptCount: 1, timeSpent: null, errorCategories: [], confidence: null })
    const many = (skill: PerformanceEvent['skill'], count: number, rate: number, base = 1) => Array.from({ length: count }, (_, i) => event(skill, base + (i % 4), Math.floor((i + 1) * rate + 1e-9) > Math.floor(i * rate + 1e-9)))

    it('too little evidence → ONE honest "not enough yet" message, never an invented insight', () => {
        const gaps = analyzeSkillGaps({ now: NOW, items: [], events: many('reading', MIN_TOTAL_OBSERVATIONS - 5, 0.2) })
        const insights = generateInsights(gaps, buildRetentionReport([], NOW))

        expect(insights).toHaveLength(1)
        expect(insights[0].id).toBe('not-enough-evidence')
        expect(insights[0].why).toMatch(/independent answers so far/)
        expect(insights[0].textPersian).toMatch(/[؀-ۿ]/)
    })

    it('"understands written better than spoken" is generated from reading vs listening evidence, with the numbers in its explanation', () => {
        const gaps = analyzeSkillGaps({ now: NOW, items: [], events: [...many('reading', 24, 0.93), ...many('listening', 24, 0.3)] })
        const insights = generateInsights(gaps, buildRetentionReport([], NOW))
        const insight = insights.find(i => i.id === 'reading-over-listening')!

        expect(insight.text).toBe('You understand written English better than spoken English.')
        expect(insight.why).toMatch(/\d+%/)
        expect(insight.action?.to).toBe('/listening')
        expect(insight.kind).toBe('attention')
    })

    it('different evidence → different insights (not static copy)', () => {
        const a = generateInsights(analyzeSkillGaps({ now: NOW, items: [], events: [...many('reading', 24, 0.93), ...many('listening', 24, 0.3)] }), buildRetentionReport([], NOW))
        const b = generateInsights(analyzeSkillGaps({ now: NOW, items: [], events: [...many('reading', 24, 0.93), ...many('listening', 24, 0.92)] }), buildRetentionReport([], NOW))

        expect(a.map(i => i.id)).not.toEqual(b.map(i => i.id))
        expect(b.every(i => i.kind === 'strength')).toBe(true)
    })

    it('reports a flagged mismatch between the SRS "mastered" label and evidence', () => {
        const events = [...many('reading', 12, 0.9), ...many('listening', 12, 0.9)]
        const srs = ['lex:a', 'lex:b', 'lex:c'].map(key => ({ key, status: 'mastered', nextReviewAt: NOW + DAY_MS }))
        const insights = generateInsights(analyzeSkillGaps({ now: NOW, items: [], events }), buildRetentionReport([], NOW, srs))

        expect(insights.find(i => i.id === 'srs-optimistic')?.text).toMatch(/3 words are marked "mastered"/)
    })

    it('every insight has English text, Persian text and a why', () => {
        const gaps = analyzeSkillGaps({ now: NOW, items: [], events: [...many('reading', 24, 0.93), ...many('listening', 24, 0.3), ...many('grammar', 10, 0.2, 40), ...many('grammar', 10, 0.9, 1)] })

        for (const insight of generateInsights(gaps, buildRetentionReport([], NOW))) {
            expect(insight.text.length).toBeGreaterThan(10)
            expect(insight.textPersian).toMatch(/[؀-ۿ]/)
            expect(insight.why.length).toBeGreaterThan(10)
        }
    })
})
