import { describe, expect, it } from 'vitest'

import { describeActivity, recentActivity, relativeTime } from './recentActivity'

import type { PerformanceEvent } from '../types/performance'

function event(overrides: Partial<PerformanceEvent>): PerformanceEvent {
    return { id: 'e', skill: 'writing', activityId: 'x', lessonId: null, timestamp: 1000, difficulty: null, result: 'correct', attemptCount: 1, timeSpent: null, errorCategories: [], confidence: null, ...overrides }
}

describe('describeActivity', () => {
    it('translates internal ids into readable titles', () => {
        expect(describeActivity(event({ activityId: 'journey-sentence-construction' })).title).toBe('Sentence building')
        expect(describeActivity(event({ activityId: 'real-life-making-tea' })).title).toBe('Real-Life English')
        expect(describeActivity(event({ activityId: 'gr-present-simple-3' })).title).toBe('Gr present simple')
        expect(describeActivity(event({ activityId: '' })).title).toBe('Practice')
    })

    it('carries outcome, skill label and error categories', () => {
        const row = describeActivity(event({ result: 'incorrect', skill: 'grammar', errorCategories: ['word-order', 'grammar'] }))

        expect(row).toMatchObject({ correct: false, skill: 'Grammar', detail: 'word order, grammar' })
    })

    it('unknown skills do not crash', () => {
        expect(describeActivity(event({ skill: 'telepathy' as never })).skill).toBe('Telepathy')
    })
})

describe('recentActivity / relativeTime', () => {
    it('newest first, capped', () => {
        const rows = recentActivity([event({ id: 'a', timestamp: 1 }), event({ id: 'c', timestamp: 3 }), event({ id: 'b', timestamp: 2 })], 2)

        expect(rows.map(row => row.id)).toEqual(['c', 'b'])
    })

    it.each([
        [0, 'just now'], [5 * 60000, '5 min ago'], [3 * 3600000, '3 h ago'], [26 * 3600000, 'yesterday'], [5 * 86400000, '5 days ago'],
    ])('%i ms ago → %s', (ago, label) => {
        expect(relativeTime(1_000_000 - ago, 1_000_000)).toBe(label)
    })
})
