import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLearningPositionStore } from './learningPosition'

beforeEach(() => setActivePinia(createPinia()))

const POSITION = { courseId: 'upgrade', lessonId: 'batch-01', title: 'Batch 01', index: 11, total: 50 }

describe('learning position bookmark', () => {
    it('starts empty, records and persists', () => {
        const store = useLearningPositionStore()
        expect(store.last).toBeNull()

        store.record(POSITION)
        setActivePinia(createPinia())

        expect(useLearningPositionStore().last).toMatchObject(POSITION)
    })

    it('latest lesson replaces the previous bookmark', () => {
        const store = useLearningPositionStore()
        store.record(POSITION)
        store.record({ ...POSITION, lessonId: 'batch-02', index: 3 })

        expect(store.last?.lessonId).toBe('batch-02')
    })

    it('rejects impossible positions', () => {
        const store = useLearningPositionStore()
        store.record({ ...POSITION, index: 50 })
        store.record({ ...POSITION, index: -1 })
        store.record({ ...POSITION, total: 0 })

        expect(store.last).toBeNull()
    })

    it('finishing the bookmarked lesson clears it; other lessons do not', () => {
        const store = useLearningPositionStore()
        store.record(POSITION)

        store.clearIfLesson('upgrade', 'batch-99')
        expect(store.last).not.toBeNull()

        store.clearIfLesson('upgrade', 'batch-01')
        expect(store.last).toBeNull()
        setActivePinia(createPinia())
        expect(useLearningPositionStore().last).toBeNull()
    })

    it('corrupted / wrong-shaped storage never crashes and reads as empty', () => {
        for (const raw of ['{not json', JSON.stringify({ __version: 1, data: 'x' }), JSON.stringify({ __version: 1, data: { courseId: 'a' } }), JSON.stringify({ __version: 1, data: { ...POSITION, index: 99 } }), JSON.stringify([1, 2])]) {
            localStorage.setItem('english-upgrade-learning-position', raw)
            setActivePinia(createPinia())
            expect(useLearningPositionStore().last).toBeNull()
        }
    })
})
