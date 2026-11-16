import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { isStarComplete, missingStarParts, useSavedAnswersStore } from './savedAnswers'
import { useInterviewHistoryStore } from './interviewHistory'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('STAR structure', () => {
    it('requires all four parts with real content', () => {
        expect(isStarComplete({ situation: '', task: '', action: '', result: '' })).toBe(false)

        expect(isStarComplete({
            situation: 'Our checkout was failing for some users.',
            task: 'I had to find the cause quickly.',
            action: 'I traced requests and found a race condition.',
            result: 'Failures dropped by half within a day.',
        })).toBe(true)
    })

    it('reports which parts are still missing or too thin', () => {
        const missing = missingStarParts({
            situation: 'A long enough situation description',
            task: 'short',
            action: '',
            result: 'A long enough result description here',
        })

        expect(missing).toEqual(['task', 'action'])
    })
})

describe('savedAnswers store', () => {
    it('creates, edits and persists a learner-written answer', () => {
        const store = useSavedAnswersStore()
        const answer = store.create('beh-01', 'A difficult situation')

        store.update(answer.id, {
            star: { situation: 'Real situation text here', task: '', action: '', result: '' },
            finalAnswer: 'My own final English answer.',
            persianNotes: 'یادداشت من',
        })

        setActivePinia(createPinia())
        const reloaded = useSavedAnswersStore()

        expect(reloaded.answers).toHaveLength(1)
        expect(reloaded.answers[0].finalAnswer).toBe('My own final English answer.')
        expect(reloaded.answers[0].star.situation).toBe('Real situation text here')
        expect(reloaded.forSource('beh-01')).toHaveLength(1)
    })

    it('partial STAR updates merge instead of wiping other parts', () => {
        const store = useSavedAnswersStore()
        const answer = store.create(null, 'x')

        store.update(answer.id, { star: { situation: 'one', task: '', action: '', result: '' } })
        store.update(answer.id, { star: { situation: 'one', task: 'two', action: '', result: '' } })

        expect(store.answers[0].star.situation).toBe('one')
        expect(store.answers[0].star.task).toBe('two')
    })

    it('migration fills missing fields without losing learner text', () => {
        localStorage.setItem('english-upgrade-saved-answers', JSON.stringify({
            __version: 1,
            data: [{ id: 'a1', finalAnswer: 'Kept text', star: { situation: 'kept sit' } }, { nope: true }],
        }))

        const store = useSavedAnswersStore()

        expect(store.answers).toHaveLength(1)
        expect(store.answers[0].finalAnswer).toBe('Kept text')
        expect(store.answers[0].star.situation).toBe('kept sit')
        expect(store.answers[0].star.task).toBe('')
    })

    it('deleting removes the answer', () => {
        const store = useSavedAnswersStore()
        const answer = store.create(null, 'temp')

        store.remove(answer.id)

        expect(store.answers).toHaveLength(0)
    })
})

describe('interviewHistory store', () => {
    it('keeps the original answer immutable and appends attempts; evaluation attaches separately', () => {
        const store = useInterviewHistoryStore()

        const first = store.addAttempt({
            questionId: 'gen-01', question: 'Tell me about yourself.', answer: 'My original answer text.',
            answerMode: 'text', mockSessionId: null,
        })
        store.addAttempt({
            questionId: 'gen-01', question: 'Tell me about yourself.', answer: 'A second attempt.',
            answerMode: 'voice', mockSessionId: null,
        })

        store.setEvaluation(first.id, {
            overall: 'ok', correctedAnswer: 'c', professionalVersion: 'p', dimensions: [],
            languageIssues: [], alternativeExpressions: [], contentSuggestions: [], followUpPractice: [],
        })

        const history = store.forQuestion('gen-01')

        expect(history).toHaveLength(2)
        expect(store.attempts.find(a => a.id === first.id)!.answer).toBe('My original answer text.')
        expect(store.attempts.find(a => a.id === first.id)!.evaluation).not.toBeNull()
    })

    it('groups mock-interview answers by session', () => {
        const store = useInterviewHistoryStore()

        store.addAttempt({ questionId: 'mock-1', question: 'Q1', answer: 'A1', answerMode: 'text', mockSessionId: 'mock-1' })
        store.addAttempt({ questionId: 'mock-1', question: 'Q2', answer: 'A2', answerMode: 'text', mockSessionId: 'mock-1' })
        store.addAttempt({ questionId: 'gen-01', question: 'Q', answer: 'A', answerMode: 'text', mockSessionId: null })

        expect(store.forMockSession('mock-1')).toHaveLength(2)
    })

    it('persists across store instances and drops malformed entries', () => {
        localStorage.setItem('english-upgrade-interview-history', JSON.stringify({
            __version: 1,
            data: [{ bad: 1 }, { id: 'ok', questionId: 'q', answer: 'kept' }],
        }))

        const store = useInterviewHistoryStore()

        expect(store.attempts).toHaveLength(1)
        expect(store.attempts[0].answer).toBe('kept')
    })
})
