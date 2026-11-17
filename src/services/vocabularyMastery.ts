import type { ItemSummary } from '../types/evidence'

/**
 * Vocabulary categories derived from EVIDENCE stages (never from SRS counters).
 * Each lexical item sits in exactly one stage category; "due for review" is an
 * overlay from the SRS schedule, and legacy items (practised before evidence
 * was recorded) are reported separately instead of being guessed at.
 */
export interface VocabularyMastery {
    total: number
    newlyIntroduced: number
    currentlyLearning: number
    independentlyRecalled: number
    independentlyProduced: number
    usedInNewContexts: number
    /** Recalled+ items that also show delayed (≥ 7 day) independent recall. */
    retained: number
    /** SRS says due now (overlay — an item can be both "recalled" and "due"). */
    dueForReview: number
    /** Seen only through earlier practice, before evidence was recorded. */
    practisedEarlier: number
}

export function vocabularyMastery(summaries: ItemSummary[], dueKeys: Set<string>, legacyOnly: Set<string> = new Set()): VocabularyMastery {
    const result: VocabularyMastery = {
        total: 0, newlyIntroduced: 0, currentlyLearning: 0, independentlyRecalled: 0, independentlyProduced: 0,
        usedInNewContexts: 0, retained: 0, dueForReview: 0, practisedEarlier: 0,
    }

    for (const summary of summaries) {
        if (!summary.key.startsWith('lex:')) continue

        result.total++

        if (legacyOnly.has(summary.key) && summary.stage === 'exposed') {
            result.practisedEarlier++
        } else {
            switch (summary.ladderStage) {
                case null:
                case 'exposed':
                    result.newlyIntroduced++
                    break
                case 'recognized':
                    result.currentlyLearning++
                    break
                case 'recalled':
                    result.independentlyRecalled++
                    break
                case 'produced':
                    result.independentlyProduced++
                    break
                case 'applied':
                    result.usedInNewContexts++
                    break
            }
        }

        if (summary.stage === 'retained') result.retained++
        if (dueKeys.has(summary.key)) result.dueForReview++
    }

    return result
}
