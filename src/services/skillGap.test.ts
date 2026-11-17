import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts } from './evidenceEngine'
import { GAP_RULES, analyzeSkillGaps } from './skillGap'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'
import type { PerformanceEvent } from '../types/performance'
import type { GapDimension } from '../types/skillGap'

const NOW = 200 * DAY_MS

/** `count` observations spread over `days` days ending `endDaysAgo` days ago; `rate` = share of successes (deterministic). */
function series(count: number, rate: number, days = 4, endDaysAgo = 1): { t: number; ok: boolean }[] {
    /* Evenly distributes round(count × rate) successes through the series, deterministically. */
    return Array.from({ length: count }, (_, i) => ({
        t: NOW - (endDaysAgo + (i % days)) * DAY_MS,
        ok: Math.floor((i + 1) * rate + 1e-9) > Math.floor(i * rate + 1e-9),
    }))
}

function ledger(key: string, mode: EvidenceMode, obs: { t: number; ok: boolean }[], over: Partial<EvidenceEntry> = {}): ItemEvidence {
    const entries: EvidenceEntry[] = obs.map(o => ({ t: o.t, mode, ok: o.ok, independent: true, verified: true, ...over }))

    return { key, kind: 'word', firstSeenAt: 0, lastAt: NOW, counts: emptyCounts(), exposures: 0, entries }
}

function events(skill: PerformanceEvent['skill'], obs: { t: number; ok: boolean }[], categories: PerformanceEvent['errorCategories'] = []): PerformanceEvent[] {
    return obs.map((o, i) => ({
        id: `${skill}${i}`, skill, activityId: 'x', lessonId: null, timestamp: o.t, difficulty: null,
        result: o.ok ? 'correct' : 'incorrect', attemptCount: 1, timeSpent: null, errorCategories: o.ok ? [] : categories, confidence: null,
    }))
}

const get = (report: ReturnType<typeof analyzeSkillGaps>, dimension: GapDimension) => report.dimensions.find(d => d.dimension === dimension)!

describe('series helper', () => {
    it('produces the requested success share', () => {
        expect(series(20, 0.3).filter(o => o.ok)).toHaveLength(6)
        expect(series(10, 0.9).filter(o => o.ok)).toHaveLength(9)
    })
})

describe('insufficient evidence is never turned into a weakness', () => {
    it('no data at all → insufficient, no estimate, no recommendation', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: [] }), 'listening')

        expect(result).toMatchObject({ classification: 'insufficient', estimate: null, observations: 0, recommendation: null })
        expect(result.why).toMatch(/No independent evidence/)
    })

    it('a few very bad results (5 of 0) are NOT a weakness', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('listening', series(5, 0)) }), 'listening')

        expect(result.classification).toBe('insufficient')
        expect(result.estimate).toBe(0)
        expect(result.why).toMatch(/at least 8/)
        expect(result.recommendation).toBeNull()
    })

    it('plenty of results all on ONE day are still insufficient', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('reading', series(20, 0.2, 1)) }), 'reading')

        expect(result.classification).toBe('insufficient')
        expect(result.distinctDays).toBe(1)
    })

    it('assisted (non-independent) and unverified ledger entries are ignored', () => {
        const hinted = ledger('lex:a', 'recall', series(20, 0.1), { independent: false })
        const basic = ledger('exercise:p', 'production', series(20, 0.1), { verified: false })
        const report = analyzeSkillGaps({ now: NOW, items: [hinted, basic], events: [] })

        expect(get(report, 'vocabRecall').observations).toBe(0)
        expect(get(report, 'sentenceConstruction').observations).toBe(0)
    })
})

describe('classification', () => {
    it('confidently low → weakness with a recommended activity and the evidence in the explanation', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('listening', series(14, 0.3)) }), 'listening')

        expect(result.classification).toBe('weakness')
        expect(result.recommendation?.to).toBe('/listening')
        expect(result.why).toMatch(/14 independent observations/)
        expect(result.confidence).toBe('medium')
        expect(get(analyzeSkillGaps({ now: NOW, items: [], events: events('listening', series(24, 0.3)) }), 'listening').confidence).toBe('high')
    })

    it('confidently high → strength (no remedial recommendation)', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('reading', series(30, 0.93)) }), 'reading')

        expect(result.classification).toBe('strength')
        expect(result.recommendation).toBeNull()
        expect(result.confidence).toBe('high')
    })

    it('near the target with modest volume → developing, not a verdict', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('writing', series(10, 0.7)) }), 'writing')

        expect(result.classification).toBe('developing')
        expect(result.recommendation).not.toBeNull()
    })

    it('every dimension is analysed independently', () => {
        const report = analyzeSkillGaps({
            now: NOW,
            items: [ledger('lex:a', 'recognition', series(20, 0.95)), ledger('lex:b', 'recall', series(20, 0.25))],
            events: [],
        })

        expect(get(report, 'vocabRecognition').classification).toBe('strength')
        expect(get(report, 'vocabRecall').classification).toBe('weakness')
        expect(get(report, 'listening').classification).toBe('insufficient')
    })

    it('recent evidence outweighs old evidence in the estimate', () => {
        const old = series(12, 1, 6, 80)
        const fresh = series(12, 0, 6, 1)
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('speaking', [...old, ...fresh]) }), 'speakingFluency')

        expect(result.estimate!).toBeLessThan(40)
    })
})

describe('trend', () => {
    it('improving: recent clearly better than earlier', () => {
        const result = get(analyzeSkillGaps({ now: NOW, items: [], events: events('grammar', [...series(10, 0.3, 5, 40), ...series(10, 0.9, 5, 1)]) }), 'grammarAccuracy')

        expect(result.trend).toBe('improving')
    })

    it('declining and steady', () => {
        expect(get(analyzeSkillGaps({ now: NOW, items: [], events: events('grammar', [...series(10, 0.9, 5, 40), ...series(10, 0.3, 5, 1)]) }), 'grammarAccuracy').trend).toBe('declining')
        expect(get(analyzeSkillGaps({ now: NOW, items: [], events: events('grammar', [...series(10, 0.7, 5, 40), ...series(10, 0.7, 5, 1)]) }), 'grammarAccuracy').trend).toBe('steady')
    })

    it('unknown when either side has fewer than 4 observations', () => {
        expect(get(analyzeSkillGaps({ now: NOW, items: [], events: events('grammar', series(20, 0.5, 5, 1)) }), 'grammarAccuracy').trend).toBe('unknown')
    })
})

describe('grammar draws on grammar events and grammar-caused writing failures only', () => {
    it('writing failures for task constraints do not count against grammar', () => {
        const writing = [...events('writing', series(10, 0)), ...[]].map(e => ({ ...e, errorCategories: ['task-constraints' as const] }))
        const report = analyzeSkillGaps({ now: NOW, items: [], events: writing })

        expect(get(report, 'grammarAccuracy').observations).toBe(0)
        expect(get(report, 'writing').observations).toBe(10)
    })

    it('writing failures caused by grammar / word order do', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [], events: events('writing', series(10, 0.2), ['grammar']) })

        expect(get(report, 'grammarAccuracy').observations).toBe(10)
    })
})

describe('natural expression', () => {
    it('counts only language-correct sentences: unnatural = miss, correct / valid alternative = hit; errors are excluded', () => {
        const entries = [
            ...series(8, 1).map(o => ({ ...o, q: 'correct' })),
            ...series(6, 0).map(o => ({ ...o, q: 'unnatural' })),
            ...series(5, 0).map(o => ({ ...o, q: 'needs-correction' })),
        ]
        const item: ItemEvidence = { key: 'exercise:p', kind: 'exercise', firstSeenAt: 0, lastAt: NOW, counts: emptyCounts(), exposures: 0, entries: entries.map(o => ({ t: o.t, mode: 'production' as const, ok: o.ok, independent: true, verified: true, q: o.q })) }
        const result = get(analyzeSkillGaps({ now: NOW, items: [item], events: [] }), 'naturalExpression')

        expect(result.observations).toBe(14)
    })
})

describe('gap patterns (need strong evidence on BOTH sides)', () => {
    const recognition = (rate: number) => ledger('lex:r', 'recognition', series(20, rate))
    const recall = (rate: number) => ledger('lex:c', 'recall', series(20, rate))

    it('recognizes words but cannot recall them', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [recognition(0.92), recall(0.3)], events: [] })

        expect(report.patterns.map(p => p.id)).toContain('recognition-without-recall')
        expect(report.patterns.find(p => p.id === 'recognition-without-recall')!.evidence).toHaveLength(2)
    })

    it('no pattern when the weaker side has insufficient evidence', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [recognition(0.92), ledger('lex:c', 'recall', series(3, 0))], events: [] })

        expect(report.patterns).toEqual([])
    })

    it('no pattern when the difference is small', () => {
        expect(analyzeSkillGaps({ now: NOW, items: [recognition(0.85), recall(0.7)], events: [] }).patterns).toEqual([])
    })

    it('constructs correct sentences that sound unnatural', () => {
        const sentences = ledger('exercise:p', 'production', series(24, 0.92))
        const unnatural: ItemEvidence = {
            ...ledger('exercise:q', 'production', []), entries: [
                ...series(5, 1).map(o => ({ t: o.t, mode: 'production' as const, ok: true, independent: true, verified: true, q: 'correct' })),
                /* An unnatural sentence is language-correct, so it PASSES (ok) — the label is what marks it. */
                ...series(15, 1).map(o => ({ t: o.t, mode: 'production' as const, ok: true, independent: true, verified: true, q: 'unnatural' })),
            ],
        }
        const report = analyzeSkillGaps({ now: NOW, items: [sentences, unnatural], events: [] })

        expect(report.patterns.map(p => p.id)).toContain('correct-but-unnatural')
    })

    it('understands written English but not spoken English', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [], events: [...events('reading', series(24, 0.93)), ...events('listening', series(24, 0.3))] })
        const pattern = report.patterns.find(p => p.id === 'reading-over-listening')

        expect(pattern?.action.to).toBe('/listening')
    })

    it('recognizes in multiple choice but cannot produce', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [recognition(0.93), ledger('exercise:p', 'production', series(20, 0.25))], events: [] })

        expect(report.patterns.map(p => p.id)).toContain('choice-without-production')
    })

    it('builds simple sentences but does not transfer them', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [ledger('exercise:p', 'production', series(24, 0.92)), ledger('pattern:polite', 'application', series(16, 0.25))], events: [] })

        expect(report.patterns.map(p => p.id)).toContain('no-transfer')
    })

    it('patterns carry English and Persian titles and a concrete action', () => {
        const report = analyzeSkillGaps({ now: NOW, items: [recognition(0.92), recall(0.3)], events: [] })
        const [pattern] = report.patterns

        expect(pattern.title.length).toBeGreaterThan(10)
        expect(pattern.titlePersian).toMatch(/[؀-ۿ]/)
        expect(pattern.action.to.startsWith('/')).toBe(true)
    })

    it('thresholds are the documented ones', () => {
        expect(GAP_RULES.target).toBe(0.7)
        expect(GAP_RULES.minObservations).toBe(8)
    })
})

describe('determinism', () => {
    it('same input → identical report', () => {
        const input = { now: NOW, items: [ledger('lex:a', 'recall', series(14, 0.5))], events: events('reading', series(12, 0.6)) }

        expect(analyzeSkillGaps(input)).toEqual(analyzeSkillGaps(input))
    })
})
