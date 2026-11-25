import { describe, expect, it } from 'vitest'

import { computeStreak } from './streak'

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

describe('computeStreak', () => {
    it('is 0 with no activity at all', () => {
        expect(computeStreak([], new Date(2026, 10, 25, 9))).toBe(0)
    })

    it('counts consecutive days ending today', () => {
        const now = new Date(2026, 10, 25, 9)
        const activity = [day(2026, 11, 23), day(2026, 11, 24), day(2026, 11, 25)]

        expect(computeStreak(activity, now)).toBe(3)
    })

    it('does not reset to 0 just because today has no activity yet — yesterday still counts', () => {
        const now = new Date(2026, 10, 25, 7) // early morning, haven't studied today
        const activity = [day(2026, 11, 23), day(2026, 11, 24)]

        expect(computeStreak(activity, now)).toBe(2)
    })

    it('breaks when a full day is skipped', () => {
        const now = new Date(2026, 10, 25, 9)
        const activity = [day(2026, 11, 20), day(2026, 11, 24), day(2026, 11, 25)] // gap on 21-23

        expect(computeStreak(activity, now)).toBe(2)
    })

    it('is 0 when the most recent activity was two or more days ago', () => {
        const now = new Date(2026, 10, 25, 9)
        const activity = [day(2026, 11, 23)]

        expect(computeStreak(activity, now)).toBe(0)
    })

    it('multiple timestamps on the same day only count as one day', () => {
        const now = new Date(2026, 10, 25, 9)
        const activity = [day(2026, 11, 25, 1), day(2026, 11, 25, 2), day(2026, 11, 25, 23)]

        expect(computeStreak(activity, now)).toBe(1)
    })

    it('ignores non-finite timestamps', () => {
        const now = new Date(2026, 10, 25, 9)
        expect(computeStreak([day(2026, 11, 25), Number.NaN], now)).toBe(1)
    })
})
