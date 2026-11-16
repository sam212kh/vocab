import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type {
    JourneyActivityStatus,
    JourneyEvidenceRecord,
    JourneyPlan,
    JourneySession,
} from '../types/journey'

/**
 * Journey persistence: the ACTIVE session (so an interrupted journey can
 * resume exactly where it stopped), completed-session history (feeds the
 * planner's no-repeat memory + roadmap), and learning-stage evidence.
 * None of this touches wordProgress / SM-2 — word scheduling stays in the
 * existing SRS; this store only records what happened in journeys.
 */

interface JourneyState {
    sessions: JourneySession[]
    evidence: JourneyEvidenceRecord[]
}

const STORAGE_KEY = 'english-upgrade-journey'

const STORAGE_VERSION = 1

const MAX_SESSIONS = 60

const MAX_EVIDENCE = 3000

/** How many recent sessions feed the no-repeat memory. */
const RECENT_WINDOW = 6

const repository = createVersionedRepository<JourneyState>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => ({ sessions: [], evidence: [] }),
    migrate: migrateStored,
})

export const useJourneyStore = defineStore('journey', () => {
    const { value: initial } = repository.load()

    const sessions = ref<JourneySession[]>(initial.sessions)
    const evidence = ref<JourneyEvidenceRecord[]>(initial.evidence)

    let sessionSequence = 0
    let evidenceSequence = 0

    const activeSession = computed(() =>
        sessions.value.find(session => session.completedAt === null) ?? null
    )

    const completedSessions = computed(() =>
        sessions.value.filter(session => session.completedAt !== null)
    )

    function startSession(plan: JourneyPlan): JourneySession {
        /* Abandon any dangling active session — one journey at a time. */
        for (const session of sessions.value) {
            if (session.completedAt === null) session.completedAt = Date.now()
        }

        const statuses: Record<string, JourneyActivityStatus> = {}

        for (const activity of plan.activities) statuses[activity.id] = 'pending'

        const session: JourneySession = {
            id: `journey-${Date.now()}-${sessionSequence++}`,
            plan,
            statuses,
            currentIndex: 0,
            startedAt: Date.now(),
            completedAt: null,
            evidenceIds: [],
        }

        sessions.value.push(session)

        if (sessions.value.length > MAX_SESSIONS) {
            sessions.value = sessions.value.slice(-MAX_SESSIONS)
        }

        save()

        return session
    }

    function addEvidence(
        sessionId: string,
        record: Omit<JourneyEvidenceRecord, 'id' | 'sessionId'>
    ): JourneyEvidenceRecord | null {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return null

        const full: JourneyEvidenceRecord = {
            ...record,
            sessionId,
            id: `ev-${Date.now()}-${evidenceSequence++}`,
        }

        evidence.value.push(full)
        session.evidenceIds.push(full.id)

        if (evidence.value.length > MAX_EVIDENCE) {
            evidence.value = evidence.value.slice(-MAX_EVIDENCE)
        }

        save()

        return full
    }

    function completeActivity(sessionId: string, activityId: string, status: 'completed' | 'skipped' = 'completed') {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session || !(activityId in session.statuses)) return

        session.statuses[activityId] = status

        const nextIndex = session.plan.activities.findIndex(
            activity => session.statuses[activity.id] === 'pending'
        )

        if (nextIndex === -1) {
            session.currentIndex = session.plan.activities.length
            session.completedAt = Date.now()
        } else {
            session.currentIndex = nextIndex
        }

        save()
    }

    function finishSession(sessionId: string) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session || session.completedAt !== null) return

        session.completedAt = Date.now()
        save()
    }

    function evidenceForSession(sessionId: string): JourneyEvidenceRecord[] {
        const ids = new Set(sessions.value.find(item => item.id === sessionId)?.evidenceIds ?? [])

        return evidence.value.filter(record => ids.has(record.id))
    }

    /**
     * Source ids of COMPLETED activities in the most recent sessions — the
     * planner's no-repeat memory. Skipped activities don't count (the
     * learner didn't practice them).
     */
    function recentlyCompletedSourceIds(): string[] {
        const recent = sessions.value
            .filter(session => session.completedAt !== null || session === activeSession.value)
            .slice(-RECENT_WINDOW)

        const ids = new Set<string>()

        for (const session of recent) {
            for (const activity of session.plan.activities) {
                if (session.statuses[activity.id] !== 'completed') continue

                ids.add(activity.sourceId)

                /* Theme-level and exercise-level ids both guard repeats. */
                const theme = session.plan.theme?.id
                if (theme && activity.sourceId.startsWith(`${theme}:`)) ids.add(theme)

                for (const exercise of activity.exercises ?? []) ids.add(exercise.id)
                for (const item of activity.retrievalItems ?? []) ids.add(`new:${item.english}`)
            }
        }

        return [...ids]
    }

    /** Distinct completed-journey count that actually completed activities. */
    const completedJourneyCount = computed(() =>
        completedSessions.value.filter(session =>
            Object.values(session.statuses).some(status => status === 'completed')
        ).length
    )

    function clear() {
        sessions.value = []
        evidence.value = []
        save()
    }

    function save() {
        repository.save({ sessions: sessions.value, evidence: evidence.value })
    }

    return {
        sessions,
        evidence,
        activeSession,
        completedSessions,
        completedJourneyCount,
        startSession,
        addEvidence,
        completeActivity,
        finishSession,
        evidenceForSession,
        recentlyCompletedSourceIds,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): JourneyState {
    const empty: JourneyState = { sessions: [], evidence: [] }

    if (!raw || typeof raw !== 'object') return empty

    const value = raw as Partial<JourneyState>

    return {
        sessions: Array.isArray(value.sessions)
            ? value.sessions.filter(
                (item): item is JourneySession =>
                    !!item &&
                    typeof item === 'object' &&
                    typeof (item as JourneySession).id === 'string' &&
                    !!(item as JourneySession).plan &&
                    Array.isArray((item as JourneySession).plan.activities)
            )
            : [],
        evidence: Array.isArray(value.evidence)
            ? value.evidence.filter(
                (item): item is JourneyEvidenceRecord =>
                    !!item &&
                    typeof item === 'object' &&
                    typeof (item as JourneyEvidenceRecord).id === 'string' &&
                    typeof (item as JourneyEvidenceRecord).stage === 'string'
            )
            : [],
    }
}
