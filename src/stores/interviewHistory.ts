import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type { InterviewAnswerEvaluation } from '../services/aiClient'

/**
 * Practice history: one record per evaluated answer attempt. The original
 * answer is immutable; retries append. Mock-interview runs share a
 * mockSessionId so a full run can be reviewed together.
 */

export interface InterviewAttempt {
    id: string
    questionId: string
    question: string
    answer: string
    answerMode: 'text' | 'voice'
    mockSessionId: string | null
    evaluation: InterviewAnswerEvaluation | null
    createdAt: number
}

const STORAGE_KEY = 'english-upgrade-interview-history'

const STORAGE_VERSION = 1

const MAX_ATTEMPTS = 150

const repository = createVersionedRepository<InterviewAttempt[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useInterviewHistoryStore = defineStore('interviewHistory', () => {
    const { value: initial } = repository.load()

    const attempts = ref<InterviewAttempt[]>(initial)

    let sequence = 0

    function addAttempt(
        input: Omit<InterviewAttempt, 'id' | 'createdAt' | 'evaluation'> & { evaluation?: InterviewAnswerEvaluation | null }
    ): InterviewAttempt {
        const attempt: InterviewAttempt = {
            ...input,
            evaluation: input.evaluation ?? null,
            id: `att-${Date.now()}-${sequence++}`,
            createdAt: Date.now(),
        }

        attempts.value.push(attempt)

        if (attempts.value.length > MAX_ATTEMPTS) {
            attempts.value = attempts.value.slice(-MAX_ATTEMPTS)
        }

        save()

        return attempt
    }

    function setEvaluation(attemptId: string, evaluation: InterviewAnswerEvaluation) {
        const attempt = attempts.value.find(item => item.id === attemptId)

        if (!attempt) return

        attempt.evaluation = evaluation
        save()
    }

    function forQuestion(questionId: string): InterviewAttempt[] {
        return attempts.value
            .filter(item => item.questionId === questionId)
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    }

    function forMockSession(mockSessionId: string): InterviewAttempt[] {
        return attempts.value.filter(item => item.mockSessionId === mockSessionId)
    }

    function clear() {
        attempts.value = []
        save()
    }

    function save() {
        repository.save(attempts.value)
    }

    return { attempts, addAttempt, setEvaluation, forQuestion, forMockSession, clear }
})

function migrateStored(raw: unknown, _storedVersion: number | null): InterviewAttempt[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is InterviewAttempt =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as InterviewAttempt).id === 'string' &&
            typeof (item as InterviewAttempt).questionId === 'string' &&
            typeof (item as InterviewAttempt).answer === 'string'
    )
}
