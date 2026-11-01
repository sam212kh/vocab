import type { WordProgress } from '../types/vocabulary'

const DAY =
    24 * 60 * 60 * 1000

const WRONG_REVIEW_DELAY =
    10 * 60 * 1000

const MIN_EASE_FACTOR = 1.3

const DEFAULT_EASE_FACTOR = 2.5

/*
 * SM-2 quality scale (0-5), collapsed from the app's
 * binary correct/wrong signal:
 *
 * 5 → correct, and the previous rep was also correct
 *     (confident, well-established recall)
 * 3 → correct, but recovering from a previous miss
 *     (barely passing — still counts as a successful rep)
 * 0 → wrong
 */
function deriveQuality(
    progress: WordProgress,
    correct: boolean
): number {
    if (!correct) {
        return 0
    }

    return progress.streak > 0 ? 5 : 3
}

export interface SpacedRepetitionResult {
    nextReviewAt: number
    easeFactor: number
    intervalDays: number
}

export function calculateNextReview(
    progress: WordProgress,
    correct: boolean
): SpacedRepetitionResult {
    const now = Date.now()

    const easeFactor =
        typeof progress.easeFactor === 'number' &&
        Number.isFinite(progress.easeFactor)
            ? progress.easeFactor
            : DEFAULT_EASE_FACTOR

    const intervalDays =
        typeof progress.intervalDays === 'number' &&
        Number.isFinite(progress.intervalDays)
            ? progress.intervalDays
            : 0

    const quality = deriveQuality(progress, correct)

    /*
     * Failed rep: SM-2 resets the repetition progress
     * entirely, but the word still needs to come back
     * soon within this session rather than tomorrow.
     */
    if (quality < 3) {
        return {
            nextReviewAt: now + WRONG_REVIEW_DELAY,
            easeFactor: Math.max(
                MIN_EASE_FACTOR,
                easeFactor - 0.2
            ),
            intervalDays: 0,
        }
    }

    const nextEaseFactor = Math.max(
        MIN_EASE_FACTOR,
        easeFactor +
            (0.1 -
                (5 - quality) *
                    (0.08 + (5 - quality) * 0.02))
    )

    let nextIntervalDays: number

    if (intervalDays <= 0) {
        nextIntervalDays = 1
    } else if (intervalDays === 1) {
        nextIntervalDays = 6
    } else {
        nextIntervalDays = Math.round(
            intervalDays * nextEaseFactor
        )
    }

    return {
        nextReviewAt: now + nextIntervalDays * DAY,
        easeFactor: nextEaseFactor,
        intervalDays: nextIntervalDays,
    }
}
