import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type { SavedAnswer } from '../types/career'

/**
 * The learner's OWN reusable interview answers (STAR draft + Persian notes
 * + final English answer). The AI may polish language but this store holds
 * only what the learner wrote — it never invents experience.
 */

const STORAGE_KEY = 'english-upgrade-saved-answers'

const STORAGE_VERSION = 1

const MAX_ANSWERS = 100

const repository = createVersionedRepository<SavedAnswer[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const STAR_KEYS = ['situation', 'task', 'action', 'result'] as const

export type StarKey = typeof STAR_KEYS[number]

/** STAR is "complete" when all four parts have real content. */
export function isStarComplete(star: SavedAnswer['star']): boolean {
    return STAR_KEYS.every(key => star[key].trim().length >= 10)
}

/** Which STAR parts are still missing/too thin. */
export function missingStarParts(star: SavedAnswer['star']): StarKey[] {
    return STAR_KEYS.filter(key => star[key].trim().length < 10)
}

export const useSavedAnswersStore = defineStore('savedAnswers', () => {
    const { value: initial } = repository.load()

    const answers = ref<SavedAnswer[]>(initial)

    let sequence = 0

    function emptyStar(): SavedAnswer['star'] {
        return { situation: '', task: '', action: '', result: '' }
    }

    function create(sourceId: string | null, title: string): SavedAnswer {
        const now = Date.now()

        const answer: SavedAnswer = {
            id: `ans-${now}-${sequence++}`,
            sourceId,
            title: title.trim() || 'Untitled answer',
            star: emptyStar(),
            persianNotes: '',
            finalAnswer: '',
            createdAt: now,
            updatedAt: now,
        }

        answers.value.push(answer)

        if (answers.value.length > MAX_ANSWERS) {
            answers.value = answers.value.slice(-MAX_ANSWERS)
        }

        save()

        return answer
    }

    function update(id: string, patch: Partial<Pick<SavedAnswer, 'title' | 'star' | 'persianNotes' | 'finalAnswer'>>) {
        const answer = answers.value.find(item => item.id === id)

        if (!answer) return

        if (patch.title !== undefined) answer.title = patch.title
        if (patch.star !== undefined) answer.star = { ...answer.star, ...patch.star }
        if (patch.persianNotes !== undefined) answer.persianNotes = patch.persianNotes
        if (patch.finalAnswer !== undefined) answer.finalAnswer = patch.finalAnswer

        answer.updatedAt = Date.now()
        save()
    }

    function remove(id: string) {
        answers.value = answers.value.filter(item => item.id !== id)
        save()
    }

    function forSource(sourceId: string): SavedAnswer[] {
        return answers.value.filter(item => item.sourceId === sourceId)
    }

    function clear() {
        answers.value = []
        save()
    }

    function save() {
        repository.save(answers.value)
    }

    return { answers, create, update, remove, forSource, clear }
})

function migrateStored(raw: unknown, _storedVersion: number | null): SavedAnswer[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw
        .filter(
            (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
        )
        .map(item => {
            const star = (item.star && typeof item.star === 'object' ? item.star : {}) as Record<string, unknown>

            return {
                id: String(item.id),
                sourceId: typeof item.sourceId === 'string' ? item.sourceId : null,
                title: typeof item.title === 'string' ? item.title : 'Untitled answer',
                star: {
                    situation: typeof star.situation === 'string' ? star.situation : '',
                    task: typeof star.task === 'string' ? star.task : '',
                    action: typeof star.action === 'string' ? star.action : '',
                    result: typeof star.result === 'string' ? star.result : '',
                },
                persianNotes: typeof item.persianNotes === 'string' ? item.persianNotes : '',
                finalAnswer: typeof item.finalAnswer === 'string' ? item.finalAnswer : '',
                createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
                updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
            }
        })
}
