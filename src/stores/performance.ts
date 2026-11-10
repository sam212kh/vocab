import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import { SKILL_NAMES } from '../types/skillProfile'
import type { SkillName } from '../types/skillProfile'
import type {
    ErrorCategory,
    PerformanceEvent,
    SkillPerformanceSummary,
} from '../types/performance'

const STORAGE_KEY = 'english-upgrade-performance-events'

const STORAGE_VERSION = 1

/** Cap stored events so localStorage can't grow unbounded; oldest dropped first. */
const MAX_EVENTS = 2000

const repository = createVersionedRepository<PerformanceEvent[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export interface RecordPerformanceInput {
    skill: SkillName
    activityId: string
    lessonId?: string | null
    difficulty?: number | null
    result: 'correct' | 'incorrect'
    attemptCount?: number
    timeSpent?: number | null
    errorCategories?: ErrorCategory[]
    confidence?: number | null
}

export const usePerformanceStore = defineStore('performance', () => {
    const { value: initial } = repository.load()

    const events = ref<PerformanceEvent[]>(initial)

    let sequence = 0

    function record(input: RecordPerformanceInput): PerformanceEvent {
        const event: PerformanceEvent = {
            id: `${Date.now()}-${sequence++}`,
            skill: input.skill,
            activityId: input.activityId,
            lessonId: input.lessonId ?? null,
            timestamp: Date.now(),
            difficulty: input.difficulty ?? null,
            result: input.result,
            attemptCount: input.attemptCount ?? 1,
            timeSpent: input.timeSpent ?? null,
            errorCategories: input.errorCategories ?? [],
            confidence: input.confidence ?? null,
        }

        events.value.push(event)

        if (events.value.length > MAX_EVENTS) {
            events.value = events.value.slice(events.value.length - MAX_EVENTS)
        }

        save()

        return event
    }

    function summarizeSkill(skill: SkillName): SkillPerformanceSummary {
        const skillEvents = events.value.filter(event => event.skill === skill)

        const correct = skillEvents.filter(event => event.result === 'correct').length
        const incorrect = skillEvents.length - correct

        const wrongCounts = new Map<string, number>()

        for (const event of skillEvents) {
            if (event.result === 'incorrect') {
                wrongCounts.set(
                    event.activityId,
                    (wrongCounts.get(event.activityId) ?? 0) + 1
                )
            }
        }

        const repeatedMistakes = Array.from(wrongCounts.entries())
            .filter(([, count]) => count > 1)
            .map(([activityId]) => activityId)

        return {
            skill,
            totalEvents: skillEvents.length,
            correct,
            incorrect,
            accuracy: skillEvents.length
                ? Math.round((correct / skillEvents.length) * 100)
                : 0,
            repeatedMistakes,
            lastActivityAt: skillEvents.length
                ? Math.max(...skillEvents.map(event => event.timestamp))
                : null,
        }
    }

    function summarizeAll(): SkillPerformanceSummary[] {
        return SKILL_NAMES.map(summarizeSkill)
    }

    function recentMistakes(limit = 10): PerformanceEvent[] {
        return [...events.value]
            .filter(event => event.result === 'incorrect')
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
    }

    function clear() {
        events.value = []
        save()
    }

    function save() {
        repository.save(events.value)
    }

    return {
        events,
        record,
        summarizeSkill,
        summarizeAll,
        recentMistakes,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): PerformanceEvent[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is PerformanceEvent =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as PerformanceEvent).id === 'string' &&
            typeof (item as PerformanceEvent).activityId === 'string' &&
            typeof (item as PerformanceEvent).skill === 'string'
    )
}
