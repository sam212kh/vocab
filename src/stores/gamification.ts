import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import type { MilestoneId } from '../services/milestones'

const STORAGE_KEY = 'english-upgrade-gamification'

const STORAGE_VERSION = 1

interface GamificationState {
    /** Milestones already shown to the learner — evaluateMilestones() re-derives WHICH are earned every time; this only prevents re-celebrating one that's already been seen. */
    seenMilestoneIds: MilestoneId[]
}

const repository = createVersionedRepository<GamificationState>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => ({ seenMilestoneIds: [] }),
    migrate: migrateStored,
})

/**
 * Deliberately the only persisted gamification state: no XP ledger (XP is
 * computed from the Learning Evidence ledger, see services/xp.ts) and no
 * streak counter (computed from existing activity timestamps, see
 * services/streak.ts) — both are derived fresh every time so there is
 * nothing here that can drift out of sync with the real learning history.
 */
export const useGamificationStore = defineStore('gamification', () => {
    const { value: initial } = repository.load()

    const state = ref<GamificationState>(initial)

    function markSeen(id: MilestoneId) {
        if (state.value.seenMilestoneIds.includes(id)) return

        state.value = { ...state.value, seenMilestoneIds: [...state.value.seenMilestoneIds, id] }
        save()
    }

    function isSeen(id: MilestoneId): boolean {
        return state.value.seenMilestoneIds.includes(id)
    }

    function clear() {
        state.value = { seenMilestoneIds: [] }
        save()
    }

    function save() {
        repository.save(state.value)
    }

    return { state, markSeen, isSeen, clear }
})

const KNOWN_IDS: MilestoneId[] = ['first-journey', 'fifty-expressions', 'seven-day-streak', 'first-conversation', 'first-roadmap-stage']

function migrateStored(raw: unknown, _storedVersion: number | null): GamificationState {
    if (!raw || typeof raw !== 'object') return { seenMilestoneIds: [] }

    const value = raw as Partial<GamificationState>

    return {
        seenMilestoneIds: Array.isArray(value.seenMilestoneIds)
            ? value.seenMilestoneIds.filter((id): id is MilestoneId => KNOWN_IDS.includes(id as MilestoneId))
            : [],
    }
}
