import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useRealLifeProgressStore } from './realLifeProgress'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('realLifeProgress store', () => {
    it('tracks step completion without duplicates and completes after all four steps', () => {
        const store = useRealLifeProgressStore()

        store.markStep('making-tea', 'learn')
        store.markStep('making-tea', 'learn')
        store.markStep('making-tea', 'practice')

        expect(store.stepCount('making-tea')).toBe(2)
        expect(store.forScenario('making-tea').completedAt).toBeNull()

        store.markStep('making-tea', 'speak')
        store.markStep('making-tea', 'roleplay')

        expect(store.forScenario('making-tea').completedAt).not.toBeNull()
        expect(store.completedCount).toBe(1)
    })

    it('persists across store instances', () => {
        const first = useRealLifeProgressStore()
        first.markStep('ordering-food', 'learn')

        setActivePinia(createPinia())
        const second = useRealLifeProgressStore()

        expect(second.stepCount('ordering-food')).toBe(1)
    })

    it('does not touch SRS storage', () => {
        const before = localStorage.getItem('english-upgrade-word-progress')

        const store = useRealLifeProgressStore()
        store.markStep('making-tea', 'learn')

        expect(localStorage.getItem('english-upgrade-word-progress')).toBe(before)
    })

    it('migration drops malformed entries', () => {
        localStorage.setItem(
            'english-upgrade-real-life-progress',
            JSON.stringify({ __version: 1, data: [{ bad: 1 }, { scenarioId: 'ok', stepsCompleted: ['learn'] }] })
        )

        const store = useRealLifeProgressStore()

        expect(store.progress).toHaveLength(1)
        expect(store.stepCount('ok')).toBe(1)
    })
})
