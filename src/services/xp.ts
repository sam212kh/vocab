import type { ItemEvidence } from '../types/evidence'

/**
 * XP is computed fresh from the existing Learning Evidence ledger every
 * time, never stored as its own mutable counter — so there is nothing to
 * get out of sync, and no way to double-award the same real event twice.
 * Only INDEPENDENT successes count (no hint, no shown correction, no
 * copied answer — see EvidenceEntry.independent): recognizing a word by
 * guessing from four options is not worth the same as recalling or
 * producing it unaided (Phase 11.6: "do not reward repeated random
 * clicks or meaningless activity").
 */

const WEIGHTS = {
    /** Retrieved a word/expression/grammar point from memory, unaided. */
    recall: 2,
    /** Built an original sentence using it, unaided. */
    production: 5,
    /** Used it correctly in a new, transferred context. */
    application: 5,
    /** A completed Daily Journey is a composite event (several of the above, already counted) plus the fact of finishing a coherent session — a small flat bonus on top, not a replacement for the per-item counts. */
    journey: 15,
} as const

export interface XpBreakdown {
    recall: number
    production: number
    application: number
    journeys: number
    total: number
}

export function computeXp(items: Record<string, ItemEvidence> | ItemEvidence[], completedJourneyCount: number): XpBreakdown {
    const list = Array.isArray(items) ? items : Object.values(items)

    let recallCount = 0
    let productionCount = 0
    let applicationCount = 0

    for (const item of list) {
        recallCount += item.counts.recall?.independentSuccess ?? 0
        productionCount += item.counts.production?.independentSuccess ?? 0
        applicationCount += item.counts.application?.independentSuccess ?? 0
    }

    const recall = recallCount * WEIGHTS.recall
    const production = productionCount * WEIGHTS.production
    const application = applicationCount * WEIGHTS.application
    const journeys = Math.max(0, completedJourneyCount) * WEIGHTS.journey

    return { recall, production, application, journeys, total: recall + production + application + journeys }
}
