import type { JourneySession } from '../types/journey'

/** Overview figures from REAL stored data. Nothing is scored or converted into a proficiency number. */

const DAY = 24 * 60 * 60 * 1000
const MAX_SESSION_MS = 90 * 60 * 1000

export interface RecentSession {
    id: string
    at: number
    objective: string
    completedActivities: number
    totalActivities: number
    /** Minutes between start and finish, capped (a tab left open overnight is not "learning time"). */
    minutes: number
}

export interface ProgressOverview {
    completedSessions: number
    /** Time between start and finish of completed Daily Journeys, each capped at 90 minutes. */
    minutesInJourneys: number
    /** Completed journeys in each of the last four weeks, newest first. */
    perWeek: number[]
    recent: RecentSession[]
}

export function buildProgressOverview(sessions: JourneySession[], now: number): ProgressOverview {
    const completed = sessions.filter(session => session.completedAt !== null)

    const minutes = (session: JourneySession) =>
        Math.round(Math.min(Math.max((session.completedAt ?? session.startedAt) - session.startedAt, 0), MAX_SESSION_MS) / 60000)

    const perWeek = [0, 1, 2, 3].map(week =>
        completed.filter(session => {
            const age = now - (session.completedAt ?? 0)

            return age >= week * 7 * DAY && age < (week + 1) * 7 * DAY
        }).length
    )

    const recent = [...completed]
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 5)
        .map(session => ({
            id: session.id,
            at: session.completedAt ?? session.startedAt,
            objective: session.plan.objective,
            completedActivities: Object.values(session.statuses).filter(status => status === 'completed').length,
            totalActivities: session.plan.activities.length,
            minutes: minutes(session),
        }))

    return {
        completedSessions: completed.length,
        minutesInJourneys: completed.reduce((sum, session) => sum + minutes(session), 0),
        perWeek,
        recent,
    }
}
