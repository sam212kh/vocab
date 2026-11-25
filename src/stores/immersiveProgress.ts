import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { ImmersiveProgress } from '../types/immersive'

const KEY = 'english-upgrade-immersive-progress'

function load(): ImmersiveProgress[] {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
        return Array.isArray(value) ? value : []
    } catch { return [] }
}

export const useImmersiveProgressStore = defineStore('immersiveProgress', () => {
    const records = ref<ImmersiveProgress[]>(load())
    const byScenario = computed(() => new Map(records.value.map(item => [item.scenarioId, item])))

    function save() { localStorage.setItem(KEY, JSON.stringify(records.value)) }
    function recordAttempt(scenarioId: string, difficulty: number) {
        const existing = records.value.find(item => item.scenarioId === scenarioId)
        if (existing) existing.attempts += 1
        else records.value.push({ scenarioId, attempts: 1, completed: 0, lastDifficulty: difficulty, lastCompletedAt: null })
        save()
    }
    function recordCompletion(scenarioId: string, difficulty: number) {
        const existing = records.value.find(item => item.scenarioId === scenarioId)
        if (existing) { existing.completed += 1; existing.lastDifficulty = difficulty; existing.lastCompletedAt = Date.now() }
        else records.value.push({ scenarioId, attempts: 1, completed: 1, lastDifficulty: difficulty, lastCompletedAt: Date.now() })
        save()
    }
    function forScenario(id: string) { return byScenario.value.get(id) }
    return { records, recordAttempt, recordCompletion, forScenario }
})
