import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useWordProgressStore } from './wordProgress'
import { useToastStore } from './toast'

const STORAGE_KEY = 'english-upgrade-word-progress'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('wordProgress store', () => {
    it('creates a new "new" status entry on first access', () => {
        const store = useWordProgressStore()

        const progress = store.getProgress('Hello', 'upgrade', 'batch-01')

        expect(progress.status).toBe('new')
        expect(progress.wordId).toBe('hello')
        expect(progress.courseId).toBe('upgrade')
    })

    it('promotes a word to "reviewing" after 2 correct answers, and "mastered" after 5', () => {
        const store = useWordProgressStore()

        for (let i = 0; i < 2; i++) {
            store.recordCorrect('word')
        }

        expect(store.getProgress('word').status).toBe('reviewing')

        for (let i = 0; i < 3; i++) {
            store.recordCorrect('word')
        }

        expect(store.getProgress('word').status).toBe('mastered')
    })

    it('a wrong answer resets the streak and drops status back to "learning"', () => {
        const store = useWordProgressStore()

        store.recordCorrect('word')
        store.recordCorrect('word')
        expect(store.getProgress('word').status).toBe('reviewing')

        store.recordWrong('word')

        const progress = store.getProgress('word')
        expect(progress.status).toBe('learning')
        expect(progress.streak).toBe(0)
    })

    it('getDueWords only returns words whose nextReviewAt has passed (or is unset)', () => {
        const store = useWordProgressStore()

        store.recordCorrect('due-word')
        store.getProgress('due-word').nextReviewAt = Date.now() - 1000

        store.recordCorrect('future-word')
        store.getProgress('future-word').nextReviewAt = Date.now() + 1000 * 60 * 60 * 24

        const due = store.getDueWords().map(item => item.wordId)

        expect(due).toContain('due-word')
        expect(due).not.toContain('future-word')
    })

    it('migrates pre-existing legacy (un-enveloped) localStorage data without losing it', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([
                {
                    wordId: 'legacy-word',
                    courseId: 'upgrade',
                    lessonId: 'batch-01',
                    status: 'mastered',
                    level: 5,
                    pos: 'noun',
                    correctAnswers: 10,
                    wrongAnswers: 1,
                    streak: 6,
                    lastReviewedAt: 1000,
                    nextReviewAt: 2000,
                    practicePriority: 0,
                    easeFactor: 2.6,
                    intervalDays: 12,
                },
            ])
        )

        const store = useWordProgressStore()

        expect(store.progress).toHaveLength(1)
        expect(store.progress[0].wordId).toBe('legacy-word')
        expect(store.progress[0].status).toBe('mastered')

        const toastStore = useToastStore()
        expect(toastStore.toasts.some(t => t.message.includes('migrated'))).toBe(true)
    })

    it('drops duplicate legacy entries for the same word, keeping the first', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([
                { wordId: 'dup', status: 'new', correctAnswers: 1 },
                { wordId: 'DUP', status: 'mastered', correctAnswers: 99 },
            ])
        )

        const store = useWordProgressStore()

        expect(store.progress).toHaveLength(1)
        expect(store.progress[0].correctAnswers).toBe(1)
    })
})
