import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useWritingHistoryStore } from './writingHistory'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('writingHistory store', () => {
    it('stores a submission with word count and constraint result', () => {
        const store = useWritingHistoryStore()

        const submission = store.addSubmission(
            'daily-journal',
            'Today I worked on my English app and fixed two bugs.',
            true,
            []
        )

        expect(submission.wordCount).toBe(11)
        expect(submission.constraintsPassed).toBe(true)
        expect(submission.evaluation).toBeNull()
    })

    it('returns submissions for a prompt newest-first', () => {
        const store = useWritingHistoryStore()

        const first = store.addSubmission('daily-journal', 'First entry.', true, [])
        first.submittedAt -= 1000

        store.addSubmission('daily-journal', 'Second entry.', true, [])
        store.addSubmission('other-prompt', 'Unrelated.', true, [])

        const history = store.getSubmissionsForPrompt('daily-journal')

        expect(history).toHaveLength(2)
        expect(history[0].text).toBe('Second entry.')
    })

    it('persists submissions across store instances', () => {
        const first = useWritingHistoryStore()
        first.addSubmission('sick-day-email', 'Dear manager, I am ill today.', false, ['Too short.'])

        setActivePinia(createPinia())
        const second = useWritingHistoryStore()

        expect(second.submissions).toHaveLength(1)
        expect(second.submissions[0].constraintIssues).toEqual(['Too short.'])
    })
})
