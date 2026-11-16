import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

/**
 * Where the learner stopped in a Learn lesson, so the Dashboard can offer
 * "continue". Purely a bookmark: it never feeds SRS, scoring or progress.
 */
export interface LearningPosition {
    courseId: string
    lessonId: string
    title: string
    /** 0-based index of the expression last viewed. */
    index: number
    total: number
    updatedAt: number
}

const STORAGE_KEY = 'english-upgrade-learning-position'
const STORAGE_VERSION = 1

const repository = createVersionedRepository<LearningPosition | null>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => null,
    migrate: migrateStored,
})

export const useLearningPositionStore = defineStore('learningPosition', () => {
    const { value: initial } = repository.load()

    const last = ref<LearningPosition | null>(initial)

    function record(position: Omit<LearningPosition, 'updatedAt'>) {
        if (!position.total || position.index < 0 || position.index >= position.total) return

        last.value = { ...position, updatedAt: Date.now() }
        repository.save(last.value)
    }

    /** Called when a lesson is finished — nothing left to continue. */
    function clearIfLesson(courseId: string, lessonId: string) {
        if (last.value?.courseId === courseId && last.value.lessonId === lessonId) {
            last.value = null
            repository.save(null)
        }
    }

    return { last, record, clearIfLesson }
})

function migrateStored(raw: unknown): LearningPosition | null {
    if (!raw || typeof raw !== 'object') return null

    const value = raw as Partial<LearningPosition>

    if (
        typeof value.courseId !== 'string' || !value.courseId ||
        typeof value.lessonId !== 'string' || !value.lessonId ||
        typeof value.title !== 'string' ||
        !Number.isInteger(value.index) || !Number.isInteger(value.total) ||
        (value.total as number) <= 0 || (value.index as number) < 0 || (value.index as number) >= (value.total as number)
    ) {
        return null
    }

    return {
        courseId: value.courseId,
        lessonId: value.lessonId,
        title: value.title,
        index: value.index as number,
        total: value.total as number,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    }
}
