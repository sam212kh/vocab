import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGrammarProgressStore } from './grammarProgress'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('grammarProgress store', () => {
    it('creates a new topic record on first access', () => {
        const store = useGrammarProgressStore()

        const progress = store.getTopicProgress('present-simple')

        expect(progress.status).toBe('new')
        expect(progress.streak).toBe(0)
    })

    it('a passed session moves the topic to reviewing and schedules a future review', () => {
        const store = useGrammarProgressStore()

        store.recordSession('articles', true, 5, 1)

        const progress = store.getTopicProgress('articles')

        expect(progress.status).toBe('reviewing')
        expect(progress.streak).toBe(1)
        expect(progress.nextReviewAt).toBeGreaterThan(Date.now())
        expect(progress.intervalDays).toBe(1)
    })

    it('mastery requires 3 consecutive passed sessions, not one', () => {
        const store = useGrammarProgressStore()

        store.recordSession('past-simple', true, 5, 0)
        expect(store.getTopicProgress('past-simple').status).toBe('reviewing')

        store.recordSession('past-simple', true, 6, 0)
        expect(store.getTopicProgress('past-simple').status).toBe('reviewing')

        store.recordSession('past-simple', true, 6, 0)
        expect(store.getTopicProgress('past-simple').status).toBe('mastered')
    })

    it('a failed session resets the streak and drops back to learning', () => {
        const store = useGrammarProgressStore()

        store.recordSession('present-perfect', true, 5, 0)
        store.recordSession('present-perfect', false, 2, 4)

        const progress = store.getTopicProgress('present-perfect')

        expect(progress.status).toBe('learning')
        expect(progress.streak).toBe(0)
    })

    it('failed sessions come back soon (SM-2 wrong-answer requeue), passed ones later', () => {
        const store = useGrammarProgressStore()

        store.recordSession('fail-topic', false, 1, 5)
        store.recordSession('pass-topic', true, 5, 0)

        const failed = store.getTopicProgress('fail-topic')
        const passed = store.getTopicProgress('pass-topic')

        expect(failed.nextReviewAt!).toBeLessThan(passed.nextReviewAt!)
    })

    it('getDueTopics excludes untouched topics and future-scheduled ones', () => {
        const store = useGrammarProgressStore()

        store.recordSession('due-topic', true, 5, 0)
        store.getTopicProgress('due-topic').nextReviewAt = Date.now() - 1000

        store.recordSession('future-topic', true, 5, 0)

        const due = store.getDueTopics().map(item => item.topicId)

        expect(due).toContain('due-topic')
        expect(due).not.toContain('future-topic')
    })

    it('persists across store instances', () => {
        const first = useGrammarProgressStore()
        first.recordSession('articles', true, 4, 2)

        setActivePinia(createPinia())
        const second = useGrammarProgressStore()

        expect(second.getTopicProgress('articles').correctAnswers).toBe(4)
    })
})
