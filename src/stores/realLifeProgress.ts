import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

/**
 * Per-scenario completion for Real-Life English. Steps completed are
 * tracked so the learner can continue later. Expression retention itself
 * rides the EXISTING SRS (wordProgress) — this store never duplicates it.
 */

export type RealLifeStep = 'learn' | 'practice' | 'speak' | 'roleplay'

export interface RealLifeScenarioProgress {
    scenarioId: string
    stepsCompleted: RealLifeStep[]
    lastVisitedAt: number
    completedAt: number | null
}

const STORAGE_KEY = 'english-upgrade-real-life-progress'

const STORAGE_VERSION = 1

const ALL_STEPS: RealLifeStep[] = ['learn', 'practice', 'speak', 'roleplay']

const repository = createVersionedRepository<RealLifeScenarioProgress[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useRealLifeProgressStore = defineStore('realLifeProgress', () => {
    const { value: initial } = repository.load()

    const progress = ref<RealLifeScenarioProgress[]>(initial)

    function forScenario(scenarioId: string): RealLifeScenarioProgress {
        let entry = progress.value.find(item => item.scenarioId === scenarioId)

        if (!entry) {
            entry = {
                scenarioId,
                stepsCompleted: [],
                lastVisitedAt: Date.now(),
                completedAt: null,
            }
            progress.value.push(entry)
            save()
        }

        return entry
    }

    function markStep(scenarioId: string, step: RealLifeStep) {
        const entry = forScenario(scenarioId)

        if (!entry.stepsCompleted.includes(step)) {
            entry.stepsCompleted.push(step)
        }

        entry.lastVisitedAt = Date.now()

        if (ALL_STEPS.every(item => entry.stepsCompleted.includes(item)) && !entry.completedAt) {
            entry.completedAt = Date.now()
        }

        save()
    }

    function touch(scenarioId: string) {
        forScenario(scenarioId).lastVisitedAt = Date.now()
        save()
    }

    const completedCount = computed(
        () => progress.value.filter(item => item.completedAt !== null).length
    )

    function stepCount(scenarioId: string): number {
        return progress.value.find(item => item.scenarioId === scenarioId)?.stepsCompleted.length ?? 0
    }

    function clear() {
        progress.value = []
        save()
    }

    function save() {
        repository.save(progress.value)
    }

    return {
        progress,
        completedCount,
        forScenario,
        markStep,
        touch,
        stepCount,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): RealLifeScenarioProgress[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is RealLifeScenarioProgress =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as RealLifeScenarioProgress).scenarioId === 'string' &&
            Array.isArray((item as RealLifeScenarioProgress).stepsCompleted)
    )
}
