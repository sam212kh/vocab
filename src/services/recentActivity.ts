import type { PerformanceEvent } from '../types/performance'

/** Human-readable rendering of raw PerformanceEvents for the Dashboard feed. */

const SKILL_LABEL: Record<string, string> = {
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    listening: 'Listening',
    speaking: 'Speaking',
    reading: 'Reading',
    writing: 'Writing',
}

const ID_LABEL: [RegExp, string][] = [
    [/^journey-sentence-construction/, 'Sentence building'],
    [/^journey-vocab-retrieval/, 'Word recall'],
    [/^journey-recognition-quiz/, 'Recognition quiz'],
    [/^journey-grammar/, 'Grammar in context'],
    [/^journey-listening/, 'Dictation'],
    [/^journey-/, 'Daily Journey'],
    [/^real-life-/, 'Real-Life English'],
    [/^career-/, 'Career English'],
]

function humanize(id: string): string {
    const cleaned = id.replace(/[-_]+/g, ' ').replace(/\s+\d+$/, '').trim()

    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Practice'
}

export interface ActivityRow {
    id: string
    title: string
    skill: string
    correct: boolean
    at: number
    detail: string
}

export function describeActivity(event: PerformanceEvent): ActivityRow {
    const known = ID_LABEL.find(([pattern]) => pattern.test(event.activityId))

    return {
        id: event.id,
        title: known ? known[1] : humanize(event.activityId),
        skill: SKILL_LABEL[event.skill] ?? humanize(event.skill),
        correct: event.result === 'correct',
        at: event.timestamp,
        detail: event.errorCategories.length ? event.errorCategories.join(', ').replace(/-/g, ' ') : '',
    }
}

export function recentActivity(events: PerformanceEvent[], limit = 6): ActivityRow[] {
    return [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit).map(describeActivity)
}

export function relativeTime(timestamp: number, now = Date.now()): string {
    const minutes = Math.floor((now - timestamp) / 60000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`

    const hours = Math.floor(minutes / 60)

    if (hours < 24) return `${hours} h ago`

    const days = Math.floor(hours / 24)

    return days === 1 ? 'yesterday' : `${days} days ago`
}
