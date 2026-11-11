import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { countWords } from '../services/exerciseEngine'

import type { WritingEvaluation, WritingSubmission } from '../types/writing'

const STORAGE_KEY = 'english-upgrade-writing-history'

/**
 * v1 → v2: submissions previously carried `evaluation: null` (a slot that
 * was never populated before the AI gateway existed). v2 stores
 * `evaluations: WritingEvaluation[]` so retries append instead of
 * overwriting. Migration maps any legacy value into an empty array —
 * no learner text is ever touched.
 */
const STORAGE_VERSION = 2

const repository = createVersionedRepository<WritingSubmission[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useWritingHistoryStore = defineStore('writingHistory', () => {
    const { value: initial } = repository.load()

    const submissions = ref<WritingSubmission[]>(initial)

    function addSubmission(
        promptId: string,
        text: string,
        constraintsPassed: boolean,
        constraintIssues: string[]
    ): WritingSubmission {
        const submission: WritingSubmission = {
            id: `${promptId}-${Date.now()}`,
            promptId,
            text,
            wordCount: countWords(text),
            submittedAt: Date.now(),
            constraintsPassed,
            constraintIssues,
            evaluations: [],
        }

        submissions.value.push(submission)
        save()

        return submission
    }

    /** Appends — previous evaluations of the same submission are kept. */
    function addEvaluation(submissionId: string, evaluation: WritingEvaluation) {
        const submission = submissions.value.find(item => item.id === submissionId)

        if (!submission) return

        submission.evaluations.push(evaluation)
        save()
    }

    function getSubmission(submissionId: string): WritingSubmission | null {
        return submissions.value.find(item => item.id === submissionId) ?? null
    }

    function getSubmissionsForPrompt(promptId: string): WritingSubmission[] {
        return submissions.value
            .filter(item => item.promptId === promptId)
            .sort((a, b) => b.submittedAt - a.submittedAt)
    }

    function clear() {
        submissions.value = []
        save()
    }

    function save() {
        repository.save(submissions.value)
    }

    return {
        submissions,
        addSubmission,
        addEvaluation,
        getSubmission,
        getSubmissionsForPrompt,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): WritingSubmission[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw
        .filter(
            (item): item is Record<string, unknown> =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).id === 'string' &&
                typeof (item as Record<string, unknown>).promptId === 'string' &&
                typeof (item as Record<string, unknown>).text === 'string'
        )
        .map(item => ({
            id: String(item.id),
            promptId: String(item.promptId),
            text: String(item.text),
            wordCount:
                typeof item.wordCount === 'number' && Number.isFinite(item.wordCount)
                    ? item.wordCount
                    : countWords(String(item.text)),
            submittedAt:
                typeof item.submittedAt === 'number' && Number.isFinite(item.submittedAt)
                    ? item.submittedAt
                    : Date.now(),
            constraintsPassed: item.constraintsPassed === true,
            constraintIssues: Array.isArray(item.constraintIssues)
                ? item.constraintIssues.filter((issue): issue is string => typeof issue === 'string')
                : [],
            /* v1 had `evaluation: null` (never populated) — becomes []. */
            evaluations: Array.isArray(item.evaluations)
                ? (item.evaluations as WritingEvaluation[])
                : [],
        }))
}
