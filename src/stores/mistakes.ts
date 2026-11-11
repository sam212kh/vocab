import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type { MistakeCategory, MistakeKind, SentenceFeedback } from '../types/writing'

/**
 * Normalized mistake tracking across evaluations. One record per
 * (category, kind); frequency + recency + links back to the submissions
 * where the mistake appeared. Re-evaluating the same submission does not
 * inflate counts (submission ids are deduplicated per record).
 *
 * 'error' records are confirmed mistakes; 'style' records are optional
 * improvement suggestions — consumers (recommendations, AI context) must
 * not treat the two alike.
 */

export interface MistakeExample {
    original: string
    corrected: string
    submissionId: string
}

export interface TrackedMistake {
    category: MistakeCategory
    kind: MistakeKind
    count: number
    firstSeenAt: number
    lastSeenAt: number
    submissionIds: string[]
    examples: MistakeExample[]
}

const STORAGE_KEY = 'english-upgrade-mistakes'

const STORAGE_VERSION = 1

const MAX_SUBMISSION_LINKS = 20

const MAX_EXAMPLES = 5

const repository = createVersionedRepository<TrackedMistake[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useMistakesStore = defineStore('mistakes', () => {
    const { value: initial } = repository.load()

    const mistakes = ref<TrackedMistake[]>(initial)

    /** Record the sentence-level findings of one evaluation. */
    function recordFromEvaluation(submissionId: string, sentences: SentenceFeedback[]) {
        const now = Date.now()
        let changed = false

        for (const sentence of sentences) {
            let record = mistakes.value.find(
                item => item.category === sentence.category && item.kind === sentence.kind
            )

            if (!record) {
                record = {
                    category: sentence.category,
                    kind: sentence.kind,
                    count: 0,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    submissionIds: [],
                    examples: [],
                }
                mistakes.value.push(record)
            }

            /* Re-evaluations of the same submission must not inflate counts. */
            if (record.submissionIds.includes(submissionId)) {
                continue
            }

            record.count++
            record.lastSeenAt = now
            record.submissionIds.push(submissionId)

            if (record.submissionIds.length > MAX_SUBMISSION_LINKS) {
                record.submissionIds = record.submissionIds.slice(-MAX_SUBMISSION_LINKS)
            }

            record.examples.push({
                original: sentence.original.slice(0, 300),
                corrected: sentence.corrected.slice(0, 300),
                submissionId,
            })

            if (record.examples.length > MAX_EXAMPLES) {
                record.examples = record.examples.slice(-MAX_EXAMPLES)
            }

            changed = true
        }

        if (changed) save()
    }

    /** Confirmed errors seen in more than one submission, most frequent first. */
    const recurringErrors = computed(() =>
        mistakes.value
            .filter(item => item.kind === 'error' && item.count >= 2)
            .sort((a, b) => b.count - a.count)
    )

    /** Category slugs for AI context / recommendations (errors only). */
    function recurringErrorCategories(limit = 5): MistakeCategory[] {
        return recurringErrors.value.slice(0, limit).map(item => item.category)
    }

    function clear() {
        mistakes.value = []
        save()
    }

    function save() {
        repository.save(mistakes.value)
    }

    return {
        mistakes,
        recordFromEvaluation,
        recurringErrors,
        recurringErrorCategories,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): TrackedMistake[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is TrackedMistake =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as TrackedMistake).category === 'string' &&
            typeof (item as TrackedMistake).count === 'number'
    )
}
