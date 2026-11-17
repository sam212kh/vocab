import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts } from './evidenceEngine'
import { RETENTION_HORIZONS, buildRetentionReport, retentionForItem } from './retention'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'

const T0 = 300 * DAY_MS

function e(daysAfterAnchor: number, ok: boolean | null, over: Partial<EvidenceEntry & { mode: EvidenceMode }> = {}): EvidenceEntry {
    return { t: T0 + daysAfterAnchor * DAY_MS, mode: 'recall', ok, independent: true, verified: true, ...over }
}

function item(entries: EvidenceEntry[], key = 'lex:achieve'): ItemEvidence {
    return { key, kind: 'word', firstSeenAt: entries[0]?.t ?? 0, lastAt: entries.at(-1)?.t ?? 0, counts: emptyCounts(), exposures: 0, entries }
}

const status = (entries: EvidenceEntry[], nowDays: number, horizon: (typeof RETENTION_HORIZONS)[number]) =>
    retentionForItem(item(entries), T0 + nowDays * DAY_MS)!.horizons.find(h => h.horizon === horizon)!.status

describe('anchor', () => {
    it('no independent recall success yet → not tracked (viewing and hinted answers do not start the clock)', () => {
        expect(retentionForItem(item([e(0, null, { mode: 'view' }), e(0, true, { independent: false })]), T0 + 5 * DAY_MS)).toBeNull()
        expect(retentionForItem(item([e(0, true, { verified: false })]), T0 + 5 * DAY_MS)).toBeNull()
    })

    it('recognition alone does not start the clock (it is guessable)', () => {
        expect(retentionForItem(item([e(0, true, { mode: 'recognition' })]), T0 + 5 * DAY_MS)).toBeNull()
    })

    it('starts at the first independent recall-level success', () => {
        expect(retentionForItem(item([e(0, true), e(2, true)]), T0 + 3 * DAY_MS)?.anchorAt).toBe(T0)
    })
})

describe.each([
    [1, 'next day'],
    [3, '3 days'],
    [7, '7 days'],
    [14, '14 days'],
] as const)('%i-day horizon (%s)', (horizon, _label) => {
    it('pending before it is reached', () => {
        expect(status([e(0, true)], horizon * 0.5, horizon)).toBe('pending')
    })

    it('due once reached and untested', () => {
        expect(status([e(0, true)], horizon + 0.5, horizon)).toBe('due')
    })

    it('missed when it stays untested beyond the grace period', () => {
        expect(status([e(0, true)], horizon + Math.max(2, horizon / 2) + 1, horizon)).toBe('missed')
    })

    it('retained: independent success at the horizon', () => {
        expect(status([e(0, true), e(horizon, true)], horizon + 1, horizon)).toBe('retained')
    })

    it('lost: independent failure at the horizon', () => {
        expect(status([e(0, true), e(horizon, false)], horizon + 1, horizon)).toBe('lost')
    })

    it('an assisted success at the horizon is NOT retention', () => {
        expect(status([e(0, true), e(horizon, true, { independent: false })], horizon + 1, horizon)).toBe('due')
    })
})

describe('nesting and tolerance', () => {
    it('a success at 8 days shows the item was still recalled "at least" 1, 3 and 7 days later, not 14', () => {
        const r = retentionForItem(item([e(0, true), e(8, true)]), T0 + 9 * DAY_MS)!

        expect(r.horizons.map(h => h.status)).toEqual(['retained', 'retained', 'retained', 'pending'])
        expect(r.retainedDays).toBe(7)
    })

    it('a next-day review at ~22 hours still counts as next-day', () => {
        expect(status([e(0, true), e(22 / 24, true)], 2, 1)).toBe('retained')
    })

    it('a review after only 10 hours is too early to count', () => {
        expect(status([e(0, true), e(10 / 24, true)], 1.2, 1)).toBe('due')
    })

    it('the FIRST test after the delay decides (a later success does not erase an earlier failure)', () => {
        const r = retentionForItem(item([e(0, true), e(1.2, false), e(2, true)]), T0 + 3 * DAY_MS)!

        expect(r.horizons[0].status).toBe('lost')
        expect(r.lostAtDays).toBe(1)
    })

    it('production and application successes also count as delayed use', () => {
        expect(status([e(0, true), e(8, true, { mode: 'production' })], 9, 7)).toBe('retained')
    })
})

describe('report', () => {
    const now = T0 + 20 * DAY_MS

    it('keeps the four metrics separate and honest', () => {
        const strong = item([e(0, true), e(1, true), e(8, true), e(15, true), e(3, true, { mode: 'production', ctx: 'p' })], 'lex:a')
        const weak = item([e(0, true), e(1.5, false)], 'lex:b')
        const patterns = item([e(2, true, { mode: 'application', ctx: 'hotel' })], 'pattern:polite')
        const report = buildRetentionReport([strong, weak, patterns], now)

        expect(report.tracked).toBe(2)
        expect(report.metrics.immediateSuccess).toMatchObject({ successes: 2, total: 2, rate: 100 })
        expect(report.metrics.delayedRecall).toMatchObject({ successes: 1, total: 2, rate: 50 })
        expect(report.metrics.independentProduction).toMatchObject({ successes: 1, total: 1 })
        expect(report.metrics.contextualTransfer).toMatchObject({ successes: 1, total: 1 })
    })

    it('nothing measured → null rates, not zero or invented numbers', () => {
        const report = buildRetentionReport([], now)

        expect(report.tracked).toBe(0)
        expect(Object.values(report.metrics).every(metric => metric.rate === null)).toBe(true)
    })

    it('lists items waiting for a retention check, oldest anchor first', () => {
        const a = item([e(-6, true)], 'lex:old')
        const b = item([e(-1.5, true)], 'lex:new')
        const report = buildRetentionReport([b, a], T0)

        expect(report.dueForRetentionCheck[0]).toBe('lex:old')
    })

    it('completing scheduled reviews is not mastery: SRS "mastered" without independent evidence is flagged', () => {
        const report = buildRetentionReport([item([e(0, true)], 'lex:thin')], now, [
            { key: 'lex:thin', status: 'mastered', nextReviewAt: now + DAY_MS },
            { key: 'lex:unknown', status: 'mastered', nextReviewAt: now + DAY_MS },
            { key: 'lex:fine', status: 'reviewing', nextReviewAt: now + DAY_MS },
        ])

        expect(report.srsOptimistic.sort()).toEqual(['lex:thin', 'lex:unknown'])
    })

    it('a "mastered" word WITH two independent recalls on different days is not flagged', () => {
        const report = buildRetentionReport([item([e(0, true), e(3, true)], 'lex:solid')], now, [{ key: 'lex:solid', status: 'mastered', nextReviewAt: now + DAY_MS }])

        expect(report.srsOptimistic).toEqual([])
    })

    it('missed SRS reviews are those overdue by more than a week', () => {
        const report = buildRetentionReport([], now, [
            { key: 'lex:late', status: 'learning', nextReviewAt: now - 9 * DAY_MS },
            { key: 'lex:ok', status: 'learning', nextReviewAt: now - 2 * DAY_MS },
            { key: 'lex:never', status: 'new', nextReviewAt: null },
        ])

        expect(report.missedReviews).toEqual(['lex:late'])
    })

    it('per-horizon counts add up to the tracked items', () => {
        const report = buildRetentionReport([item([e(0, true), e(1, true)], 'lex:a'), item([e(15, true)], 'lex:b')], T0 + 16 * DAY_MS)

        for (const row of report.perHorizon) expect(row.retained + row.lost + row.due + row.missed + row.pending).toBe(report.tracked)
    })
})
