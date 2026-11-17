import { describe, expect, it } from 'vitest'

import { DAY_MS, EVIDENCE_RULES, emptyCounts, isQualifyingSuccess, summarizeItem, wilsonLower, wilsonUpper } from './evidenceEngine'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'

const NOW = 100 * DAY_MS

function entry(daysAgo: number, mode: EvidenceMode, ok: boolean | null, overrides: Partial<EvidenceEntry> = {}): EvidenceEntry {
    return { t: NOW - daysAgo * DAY_MS, mode, ok, independent: true, verified: true, ...overrides }
}

function item(entries: EvidenceEntry[], key = 'put the kettle on'): ItemEvidence {
    const counts = emptyCounts()

    for (const e of entries) {
        const c = counts[e.mode]

        c.attempts++
        if (e.ok === true && e.independent) c.independentSuccess++
        else if (e.ok === true) c.assistedSuccess++
        else if (e.ok === false) c.failures++
    }

    return {
        key, kind: 'expression',
        firstSeenAt: entries.length ? Math.min(...entries.map(e => e.t)) : 0,
        lastAt: entries.length ? Math.max(...entries.map(e => e.t)) : 0,
        counts, exposures: entries.filter(e => e.mode === 'view').length, entries,
    }
}

const summarize = (entries: EvidenceEntry[]) => summarizeItem(item(entries), NOW)

describe('exposure is not knowledge', () => {
    it('no entries → no stage, strength none', () => {
        const summary = summarize([])

        expect(summary.stage).toBeNull()
        expect(summary.strength).toBe('none')
        expect(summary.confidence).toBe(0)
    })

    it('any number of views → still only "exposed", with insufficient evidence', () => {
        const summary = summarize([entry(5, 'view', null), entry(4, 'view', null), entry(1, 'view', null)])

        expect(summary.stage).toBe('exposed')
        expect(summary.independentSuccesses).toBe(0)
        expect(summary.strength).toBe('insufficient')
        expect(summary.confidence).toBe(0)
    })
})

describe('a single correct answer never establishes anything', () => {
    it.each(['recognition', 'recall', 'production', 'application'] as const)('one independent %s success → still only exposed', mode => {
        const summary = summarize([entry(1, mode, true)])

        expect(summary.ladderStage).toBe('exposed')
        expect(summary.strength).toBe('insufficient')
    })

    it('three independent recognition successes → recognized (3 correct by chance on 4 options ≈ 1.6%)', () => {
        const summary = summarize([entry(3, 'recognition', true), entry(2, 'recognition', true), entry(1, 'recognition', true)])

        expect(summary.ladderStage).toBe('recognized')
        expect(0.25 ** 3).toBeLessThan(0.02)
    })

    it('recall is worth two recognition points: one of each is enough for "recognized", two recognitions are not', () => {
        expect(summarize([entry(2, 'recognition', true), entry(1, 'recall', true)]).ladderStage).toBe('recognized')
        expect(summarize([entry(2, 'recognition', true), entry(1, 'recognition', true)]).ladderStage).toBe('exposed')
    })
})

describe('recalled needs two successes on different days', () => {
    it('two recalls on the SAME day → recognized only (could be working memory)', () => {
        const summary = summarize([entry(1, 'recall', true), entry(1, 'recall', true, { t: NOW - DAY_MS + 3600000 })])

        expect(summary.ladderStage).toBe('recognized')
        expect(summary.stages.recalled.missing.join(' ')).toMatch(/different day/)
    })

    it('two recalls on different days → recalled', () => {
        expect(summarize([entry(3, 'recall', true), entry(1, 'recall', true)]).ladderStage).toBe('recalled')
    })

    it('successes in higher modes count for lower stages (production on two days ⇒ recalled)', () => {
        const summary = summarize([entry(3, 'production', true, { ctx: 'a' }), entry(1, 'production', true, { ctx: 'a' })])

        expect(summary.stages.recalled.satisfied).toBe(true)
    })
})

describe('assisted, AI-supported and unverified answers are not independent evidence', () => {
    const many = (mode: EvidenceMode, over: Partial<EvidenceEntry>) =>
        [6, 5, 4, 3, 2, 1].map(day => entry(day, mode, true, { ctx: `c${day}`, ...over }))

    it('hint-assisted recall never counts as independent recall', () => {
        const summary = summarize(many('recall', { independent: false }))

        expect(summary.ladderStage).toBe('exposed')
        expect(summary.assistedSuccesses).toBe(6)
        expect(summary.independentSuccesses).toBe(0)
        expect(summary.confidence).toBe(0)
    })

    it('AI-assisted / copied production never counts as independent production', () => {
        const summary = summarize(many('production', { independent: false }))

        expect(summary.stages.produced.satisfied).toBe(false)
        expect(summary.assistedSuccesses).toBe(6)
    })

    it('shallow deterministic checks (unverified) are counted separately and never progress a stage', () => {
        const summary = summarize(many('application', { verified: false }))

        expect(summary.ladderStage).toBe('exposed')
        expect(summary.unverifiedSuccesses).toBe(6)
        expect(isQualifyingSuccess(entry(1, 'recall', true, { verified: false }))).toBe(false)
    })

    it('mixing assisted successes with a few independent ones only counts the independent ones', () => {
        const summary = summarize([entry(5, 'recall', true, { independent: false }), entry(4, 'recall', true, { independent: false }), entry(2, 'recall', true), entry(1, 'recall', true)])

        expect(summary.independentSuccesses).toBe(2)
        expect(summary.assistedSuccesses).toBe(2)
        expect(summary.ladderStage).toBe('recalled')
    })
})

describe('produced and applied require variety', () => {
    const recalledBase = [entry(9, 'recall', true), entry(8, 'recall', true)]

    it('two sentences for the SAME prompt → not produced', () => {
        const summary = summarize([...recalledBase, entry(3, 'production', true, { ctx: 'p1' }), entry(2, 'production', true, { ctx: 'p1' })])

        expect(summary.ladderStage).toBe('recalled')
        expect(summary.stages.produced.missing.join(' ')).toMatch(/different prompt/)
    })

    it('two sentences for different prompts → produced', () => {
        const summary = summarize([...recalledBase, entry(3, 'production', true, { ctx: 'p1' }), entry(2, 'production', true, { ctx: 'p2' })])

        expect(summary.ladderStage).toBe('produced')
    })

    it('applied needs two successes in two different transfer contexts', () => {
        const produced = [...recalledBase, entry(7, 'production', true, { ctx: 'p1' }), entry(6, 'production', true, { ctx: 'p2' })]

        expect(summarize([...produced, entry(2, 'application', true, { ctx: 'hotel' })]).ladderStage).toBe('produced')
        expect(summarize([...produced, entry(2, 'application', true, { ctx: 'hotel' }), entry(1, 'application', true, { ctx: 'hotel' })]).ladderStage).toBe('produced')
        expect(summarize([...produced, entry(2, 'application', true, { ctx: 'hotel' }), entry(1, 'application', true, { ctx: 'airport' })]).ladderStage).toBe('applied')
    })

    it('the ladder is strict: applied-level evidence alone cannot skip a missing lower stage', () => {
        /* Application wins count for the lower stages, but produced still needs 2 distinct contexts. */
        const summary = summarize([entry(3, 'application', true, { ctx: 'hotel' }), entry(1, 'application', true, { ctx: 'hotel' })])

        expect(summary.stages.recalled.satisfied).toBe(true)
        expect(summary.stages.produced.satisfied).toBe(false)
        expect(summary.ladderStage).toBe('recalled')
    })
})

describe('conflicting evidence and confidence', () => {
    const solid = [entry(9, 'recall', true), entry(8, 'recall', true), entry(5, 'recall', true), entry(3, 'recall', true)]

    it('a recent failure after successes marks the evidence conflicting and lowers confidence', () => {
        const without = summarize(solid)
        const withSlip = summarize([...solid, entry(1, 'recall', false)])

        expect(without.conflicting).toBe(false)
        expect(withSlip.conflicting).toBe(true)
        expect(withSlip.confidence).toBeLessThan(without.confidence)
    })

    it('one slip does not erase a stage (retrieval is noisy)', () => {
        expect(summarize([...solid, entry(1, 'recall', false)]).ladderStage).toBe('recalled')
    })

    it('two failures among the last three attempts lower the stage and say so', () => {
        const summary = summarize([...solid, entry(2, 'recall', false), entry(1, 'recall', false)])

        expect(summary.contradicted).toBe(true)
        expect(summary.ladderStage).not.toBe('recalled')
    })

    it('more independent evidence → higher confidence; none → zero', () => {
        const few = summarize([entry(3, 'recall', true), entry(1, 'recall', true)])
        const more = summarize([...solid, entry(2, 'recall', true), entry(1, 'recall', true)])

        expect(more.confidence).toBeGreaterThan(few.confidence)
        expect(summarize([entry(1, 'view', null)]).confidence).toBe(0)
    })

    it('recent evidence weighs more than old evidence', () => {
        const old = summarize([entry(90, 'recall', true), entry(88, 'recall', true), entry(87, 'recall', true), entry(86, 'recall', true)])
        const fresh = summarize([entry(4, 'recall', true), entry(3, 'recall', true), entry(2, 'recall', true), entry(1, 'recall', true)])

        expect(fresh.confidence).toBeGreaterThan(old.confidence)
    })

    it('strength labels: insufficient (< 3 attempts) → emerging → established', () => {
        expect(summarize([entry(2, 'recall', true), entry(1, 'recall', true)]).strength).toBe('insufficient')
        expect(summarize([entry(3, 'recall', true), entry(2, 'recall', false), entry(1, 'recall', true)]).strength).toBe('emerging')
        expect(summarize([...solid, entry(2, 'recall', true), entry(1, 'recall', true)]).strength).toBe('established')
    })
})

describe('retention: independent success ≥ 7 days after the first', () => {
    it('6 days later → recalled but not retained', () => {
        const summary = summarize([entry(10, 'recall', true), entry(4, 'recall', true)])

        expect(summary.stage).toBe('recalled')
        expect(summary.longestRetainedDays).toBe(6)
    })

    it('8 days later → retained', () => {
        const summary = summarize([entry(10, 'recall', true), entry(2, 'recall', true)])

        expect(summary.stage).toBe('retained')
        expect(summary.ladderStage).toBe('recalled')
    })

    it('an assisted success at 8 days does not make it retained', () => {
        expect(summarize([entry(10, 'recall', true), entry(5, 'recall', true), entry(2, 'recall', true, { independent: false })]).stage).toBe('recalled')
    })

    it('a failure after the long gap withdraws "retained"', () => {
        expect(summarize([entry(12, 'recall', true), entry(6, 'recall', true), entry(1, 'recall', false)]).stage).not.toBe('retained')
    })
})

describe('historical vs recent evidence', () => {
    it('splits independent attempts at the recent window', () => {
        const summary = summarize([entry(40, 'recall', true), entry(35, 'recall', false), entry(3, 'recall', true), entry(1, 'recall', true)])

        expect(summary.historical).toEqual({ attempts: 2, successes: 1 })
        expect(summary.recent).toEqual({ attempts: 2, successes: 2 })
        expect(EVIDENCE_RULES.recentWindowDays).toBe(14)
    })
})

describe('bookkeeping', () => {
    it('evidenceCount uses lifetime totals, not just the stored entries', () => {
        const base = item([entry(1, 'recall', true)])

        base.counts.recall.attempts = 50
        base.exposures = 4

        expect(summarizeItem(base, NOW).evidenceCount).toBe(54 + 0 + 0)
    })

    it('is deterministic and order-independent', () => {
        const entries = [entry(3, 'recall', true), entry(1, 'recall', true), entry(2, 'recognition', true)]

        expect(summarizeItem(item(entries), NOW)).toEqual(summarizeItem(item([...entries].reverse()), NOW))
    })

    it('exposes the evidence history and last observed time', () => {
        const summary = summarize([entry(3, 'view', null), entry(1, 'recall', true)])

        expect(summary.history).toHaveLength(2)
        expect(summary.lastObservedAt).toBe(NOW - DAY_MS)
    })

    it('Wilson bounds behave: no trials → [0,1]; more trials tighten; bounds ordered', () => {
        expect(wilsonLower(0, 0)).toBe(0)
        expect(wilsonUpper(0, 0)).toBe(1)
        expect(wilsonLower(9, 10)).toBeGreaterThan(wilsonLower(3, 4))
        expect(wilsonLower(7, 10)).toBeLessThan(0.7)
        expect(wilsonUpper(7, 10)).toBeGreaterThan(0.7)
    })
})
