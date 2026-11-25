import { describe, expect, it } from 'vitest'

import { computeXp } from './xp'
import type { ItemEvidence, ModeCounts } from '../types/evidence'

const counts = (over: Partial<Record<keyof ItemEvidence['counts'], Partial<ModeCounts>>> = {}): ItemEvidence['counts'] => {
    const empty: ModeCounts = { attempts: 0, independentSuccess: 0, assistedSuccess: 0, failures: 0 }

    return {
        view: { ...empty, ...over.view },
        recognition: { ...empty, ...over.recognition },
        recall: { ...empty, ...over.recall },
        production: { ...empty, ...over.production },
        application: { ...empty, ...over.application },
    }
}

const item = (c: ItemEvidence['counts']): ItemEvidence => ({
    key: 'lex:test',
    kind: 'word',
    firstSeenAt: 0,
    lastAt: 0,
    counts: c,
    exposures: 1,
    entries: [],
})

describe('computeXp', () => {
    it('is 0 with no evidence and no journeys', () => {
        expect(computeXp([], 0).total).toBe(0)
    })

    it('awards recall points only for independent successes', () => {
        const { total, recall } = computeXp([item(counts({ recall: { independentSuccess: 3 } }))], 0)

        expect(recall).toBe(6)
        expect(total).toBe(6)
    })

    it('weighs production and application higher than recall', () => {
        const recallOnly = computeXp([item(counts({ recall: { independentSuccess: 1 } }))], 0).total
        const productionOnly = computeXp([item(counts({ production: { independentSuccess: 1 } }))], 0).total

        expect(productionOnly).toBeGreaterThan(recallOnly)
    })

    it('never counts assisted successes, attempts, or failures', () => {
        const only_assisted = computeXp([item(counts({ recall: { assistedSuccess: 10, attempts: 10, failures: 10 } }))], 0)

        expect(only_assisted.total).toBe(0)
    })

    it('adds a flat bonus per completed journey, on top of per-item evidence', () => {
        const withoutJourneys = computeXp([item(counts({ recall: { independentSuccess: 1 } }))], 0).total
        const withJourneys = computeXp([item(counts({ recall: { independentSuccess: 1 } }))], 2).total

        expect(withJourneys).toBeGreaterThan(withoutJourneys)
    })

    it('never goes negative for a negative journey count', () => {
        expect(computeXp([], -5).journeys).toBe(0)
    })

    it('accepts a Record keyed by item id, not just an array', () => {
        const byKey = { 'lex:a': item(counts({ recall: { independentSuccess: 2 } })) }

        expect(computeXp(byKey, 0).total).toBe(4)
    })
})
