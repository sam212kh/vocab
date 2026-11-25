import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGamificationStore } from './gamification'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('gamification store', () => {
    it('starts with nothing seen', () => {
        const store = useGamificationStore()

        expect(store.state.seenMilestoneIds).toEqual([])
        expect(store.isSeen('first-journey')).toBe(false)
    })

    it('markSeen records a milestone and isSeen reflects it', () => {
        const store = useGamificationStore()

        store.markSeen('first-journey')

        expect(store.isSeen('first-journey')).toBe(true)
        expect(store.isSeen('fifty-expressions')).toBe(false)
    })

    it('marking the same milestone twice does not duplicate it', () => {
        const store = useGamificationStore()

        store.markSeen('seven-day-streak')
        store.markSeen('seven-day-streak')

        expect(store.state.seenMilestoneIds.filter(id => id === 'seven-day-streak')).toHaveLength(1)
    })

    it('persists across store instances', () => {
        const first = useGamificationStore()
        first.markSeen('first-conversation')

        setActivePinia(createPinia())
        const second = useGamificationStore()

        expect(second.isSeen('first-conversation')).toBe(true)
    })

    it('drops unknown ids from corrupted storage instead of crashing', () => {
        localStorage.setItem(
            'english-upgrade-gamification',
            JSON.stringify({ __version: 1, data: { seenMilestoneIds: ['not-a-real-milestone', 'first-journey'] } })
        )

        const store = useGamificationStore()

        expect(store.state.seenMilestoneIds).toEqual(['first-journey'])
    })

    it('clear() resets to nothing seen', () => {
        const store = useGamificationStore()
        store.markSeen('first-journey')

        store.clear()

        expect(store.state.seenMilestoneIds).toEqual([])
    })
})
