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
        expect(submission.evaluations).toEqual([])
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

    it('migrates v1 records (evaluation: null) to v2 (evaluations: []) without losing text', () => {
        localStorage.setItem(
            'english-upgrade-writing-history',
            JSON.stringify({
                __version: 1,
                data: [{
                    id: 'old-1',
                    promptId: 'daily-journal',
                    text: 'My old v1 submission text.',
                    wordCount: 5,
                    submittedAt: 1000,
                    constraintsPassed: true,
                    constraintIssues: [],
                    evaluation: null,
                }],
            })
        )

        const store = useWritingHistoryStore()

        expect(store.submissions).toHaveLength(1)
        expect(store.submissions[0].text).toBe('My old v1 submission text.')
        expect(store.submissions[0].evaluations).toEqual([])
    })

    it('addEvaluation appends — a retry never overwrites earlier evaluations or the original text', () => {
        const store = useWritingHistoryStore()
        const submission = store.addSubmission('daily-journal', 'Original learner text.', true, [])

        const makeEvaluation = (model: string) => ({
            provider: 'ollama', model, promptVersion: 'writing-evaluator-v1',
            evaluatedAt: Date.now(), durationMs: 10, fallbackUsed: false,
            overall: 'ok', correctedVersion: 'c', naturalVersion: 'n',
            dimensions: [], sentences: [], vocabulary: [], priorities: [], followUpExercises: [],
        })

        store.addEvaluation(submission.id, makeEvaluation('first'))
        store.addEvaluation(submission.id, makeEvaluation('second'))

        const stored = store.getSubmission(submission.id)!

        expect(stored.evaluations).toHaveLength(2)
        expect(stored.evaluations[0].model).toBe('first')
        expect(stored.text).toBe('Original learner text.')
    })
})
