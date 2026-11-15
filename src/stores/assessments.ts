import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type {
    AdministeredItemRecord,
    AssessmentSession,
    AssessmentSessionKind,
    AssessmentSkill,
    SkillEstimateResult,
} from '../types/assessment'

const STORAGE_KEY = 'english-upgrade-assessments'

const STORAGE_VERSION = 1

const MAX_SESSIONS = 50

const repository = createVersionedRepository<AssessmentSession[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

/**
 * Client-side mirror of assessment sessions. The SERVER owns the active
 * state (pending item, presentation mappings, answer keys) — this store
 * keeps only history: answer summaries (itemId/level/type/correct) and
 * final results. Nothing stored here could reconstruct an answer key.
 * Results are append-only; completing a new assessment never deletes or
 * mutates a previous session's result. This store never touches
 * wordProgress / spacedRepetition / any SRS data.
 */
export const useAssessmentsStore = defineStore('assessments', () => {
    const { value: initial } = repository.load()

    const sessions = ref<AssessmentSession[]>(initial)

    function trackStarted(serverSessionId: string, skill: AssessmentSkill, kind: AssessmentSessionKind): AssessmentSession {
        const session: AssessmentSession = {
            id: serverSessionId,
            kind,
            skill,
            status: 'active',
            startedAt: Date.now(),
            completedAt: null,
            administered: [],
            result: null,
        }

        sessions.value.push(session)

        if (sessions.value.length > MAX_SESSIONS) {
            const removable = sessions.value
                .filter(item => item.status === 'completed' || item.status === 'abandoned')
                .sort((a, b) => a.startedAt - b.startedAt)

            while (sessions.value.length > MAX_SESSIONS && removable.length) {
                const victim = removable.shift()!
                sessions.value = sessions.value.filter(item => item.id !== victim.id)
            }
        }

        save()

        return session
    }

    function recordAnswer(sessionId: string, record: AdministeredItemRecord) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        /* One record per item — a re-sent answer must not duplicate. */
        if (session.administered.some(item => item.itemId === record.itemId)) return

        session.administered.push(record)
        save()
    }

    function setStatus(sessionId: string, status: AssessmentSession['status']) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        session.status = status
        save()
    }

    function recordResult(sessionId: string, result: SkillEstimateResult) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        session.status = 'completed'
        session.completedAt = Date.now()
        session.result = result
        save()
    }

    const completedSessions = computed(() =>
        sessions.value
            .map((session, index) => ({ session, index }))
            .filter(({ session }) => session.status === 'completed' && session.result !== null)
            /* startedAt can tie within one millisecond — break ties by
             * insertion order so "latest" is deterministic. */
            .sort((a, b) =>
                b.session.startedAt - a.session.startedAt || b.index - a.index
            )
            .map(({ session }) => session)
    )

    /** Latest completed estimate per skill (null when none exists). */
    function latestEstimate(skill: AssessmentSkill): SkillEstimateResult | null {
        return completedSessions.value.find(session => session.skill === skill)?.result ?? null
    }

    const resumableSession = computed(() =>
        sessions.value.find(session => session.status === 'active' || session.status === 'paused') ?? null
    )

    function clear() {
        sessions.value = []
        save()
    }

    function save() {
        repository.save(sessions.value)
    }

    return {
        sessions,
        completedSessions,
        resumableSession,
        trackStarted,
        recordAnswer,
        setStatus,
        recordResult,
        latestEstimate,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): AssessmentSession[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is AssessmentSession =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as AssessmentSession).id === 'string' &&
            typeof (item as AssessmentSession).skill === 'string' &&
            Array.isArray((item as AssessmentSession).administered)
    )
}
