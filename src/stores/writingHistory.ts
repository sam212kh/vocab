import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { countWords } from '../services/exerciseEngine'

import type { WritingSubmission } from '../types/writing'

const STORAGE_KEY = 'english-upgrade-writing-history'

const STORAGE_VERSION = 1

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
            evaluation: null,
        }

        submissions.value.push(submission)
        save()

        return submission
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
        getSubmissionsForPrompt,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): WritingSubmission[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is WritingSubmission =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as WritingSubmission).id === 'string' &&
            typeof (item as WritingSubmission).promptId === 'string' &&
            typeof (item as WritingSubmission).text === 'string'
    )
}
