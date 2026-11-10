import { describe, expect, it } from 'vitest'

import { calculateNextReview } from './spacedRepetition'

import type { WordProgress } from '../types/vocabulary'

function makeProgress(overrides: Partial<WordProgress> = {}): WordProgress {
    return {
        wordId: 'example',
        courseId: '',
        lessonId: '',
        status: 'new',
        level: 0,
        pos: '',
        correctAnswers: 0,
        wrongAnswers: 0,
        streak: 0,
        lastReviewedAt: null,
        nextReviewAt: null,
        practicePriority: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        ...overrides,
    }
}

describe('calculateNextReview', () => {
    it('schedules a wrong answer for a short in-session delay and resets the interval', () => {
        const progress = makeProgress({ streak: 3, intervalDays: 6, easeFactor: 2.5 })

        const before = Date.now()
        const result = calculateNextReview(progress, false)

        expect(result.intervalDays).toBe(0)
        expect(result.easeFactor).toBeCloseTo(2.3, 5)
        expect(result.nextReviewAt).toBeGreaterThan(before)
        expect(result.nextReviewAt - before).toBeLessThan(15 * 60 * 1000)
    })

    it('never drops ease factor below the SM-2 floor of 1.3', () => {
        const progress = makeProgress({ easeFactor: 1.35 })

        const result = calculateNextReview(progress, false)

        expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
    })

    it('first correct answer (fresh word) schedules a 1 day interval', () => {
        const progress = makeProgress({ streak: 0, intervalDays: 0 })

        const result = calculateNextReview(progress, true)

        expect(result.intervalDays).toBe(1)
    })

    it('second consecutive correct answer schedules a 6 day interval', () => {
        const progress = makeProgress({ streak: 1, intervalDays: 1 })

        const result = calculateNextReview(progress, true)

        expect(result.intervalDays).toBe(6)
    })

    it('a confident correct answer (already on a streak) grows the interval faster than a recovery pass', () => {
        const confident = calculateNextReview(
            makeProgress({ streak: 2, intervalDays: 6, easeFactor: 2.5 }),
            true
        )

        const recovering = calculateNextReview(
            makeProgress({ streak: 0, intervalDays: 6, easeFactor: 2.5 }),
            true
        )

        expect(confident.intervalDays).toBeGreaterThan(recovering.intervalDays)
    })
})
