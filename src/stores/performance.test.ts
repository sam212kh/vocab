import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { usePerformanceStore } from './performance'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('performance store', () => {
    it('records a structured event with defaults filled in', () => {
        const store = usePerformanceStore()

        const event = store.record({
            skill: 'grammar',
            activityId: 'present-simple-1',
            lessonId: 'present-simple',
            result: 'correct',
        })

        expect(event.skill).toBe('grammar')
        expect(event.attemptCount).toBe(1)
        expect(event.errorCategories).toEqual([])
        expect(event.timestamp).toBeGreaterThan(0)
    })

    it('summarizes per-skill accuracy from recorded events', () => {
        const store = usePerformanceStore()

        store.record({ skill: 'listening', activityId: 'a', result: 'correct' })
        store.record({ skill: 'listening', activityId: 'b', result: 'correct' })
        store.record({ skill: 'listening', activityId: 'c', result: 'incorrect' })

        const summary = store.summarizeSkill('listening')

        expect(summary.totalEvents).toBe(3)
        expect(summary.correct).toBe(2)
        expect(summary.accuracy).toBe(67)
    })

    it('identifies repeated mistakes (same activity wrong more than once)', () => {
        const store = usePerformanceStore()

        store.record({ skill: 'grammar', activityId: 'articles-2', result: 'incorrect' })
        store.record({ skill: 'grammar', activityId: 'articles-2', result: 'incorrect' })
        store.record({ skill: 'grammar', activityId: 'articles-4', result: 'incorrect' })

        const summary = store.summarizeSkill('grammar')

        expect(summary.repeatedMistakes).toEqual(['articles-2'])
    })

    it('skills with no events report zero accuracy, not invented numbers', () => {
        const store = usePerformanceStore()

        const summary = store.summarizeSkill('writing')

        expect(summary.totalEvents).toBe(0)
        expect(summary.accuracy).toBe(0)
        expect(summary.lastActivityAt).toBeNull()
    })

    it('persists events across store instances', () => {
        const first = usePerformanceStore()
        first.record({ skill: 'reading', activityId: 'remote-1', result: 'correct' })

        setActivePinia(createPinia())
        const second = usePerformanceStore()

        expect(second.events).toHaveLength(1)
        expect(second.events[0].activityId).toBe('remote-1')
    })

    it('recentMistakes returns newest-first incorrect events only', () => {
        const store = usePerformanceStore()

        store.record({ skill: 'reading', activityId: 'ok', result: 'correct' })
        store.record({ skill: 'reading', activityId: 'wrong-1', result: 'incorrect' })
        store.record({ skill: 'listening', activityId: 'wrong-2', result: 'incorrect' })

        const mistakes = store.recentMistakes(5)

        expect(mistakes).toHaveLength(2)
        expect(mistakes.every(event => event.result === 'incorrect')).toBe(true)
    })
})
