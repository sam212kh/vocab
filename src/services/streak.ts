/**
 * Daily streak: consecutive days (ending today or yesterday) with at least
 * one meaningful learning activity. "Meaningful" is decided by the caller —
 * this only counts days, it never decides what counts. Pass in every
 * timestamp (ms) from every store that represents real activity (a word
 * reviewed, a journey completed, a grammar topic answered, ...): merely
 * opening the app must never produce a timestamp that reaches here.
 *
 * Computed fresh from existing timestamps every time, not stored — so there
 * is nothing to get out of sync with the data it's measuring, and no new
 * persisted state is needed just for this (Phase 11.6: "do not reward
 * merely opening the application").
 */

function dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function computeStreak(activityTimestampsMs: readonly number[], now: Date = new Date()): number {
    const days = new Set<string>()

    for (const ts of activityTimestampsMs) {
        if (Number.isFinite(ts)) days.add(dateKey(new Date(ts)))
    }

    const cursor = new Date(now)
    cursor.setHours(0, 0, 0, 0)

    /*
     * A streak isn't broken the moment today's activity hasn't happened yet
     * — it only breaks once a full day has passed with nothing done. So if
     * today has no activity, start counting from yesterday instead; if
     * yesterday has none either, the streak is 0.
     */
    if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1)

    let streak = 0

    while (days.has(dateKey(cursor))) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
    }

    return streak
}
