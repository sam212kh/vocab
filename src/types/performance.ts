import type { SkillName } from './skillProfile'

export type ErrorCategory =
    | 'grammar'
    | 'vocabulary'
    | 'spelling'
    | 'comprehension'
    | 'word-order'
    | 'listening-detail'
    | 'task-constraints'

/**
 * One structured record per completed learning activity (an exercise, a
 * dictation, a completed grammar session...). These feed the OBSERVED side
 * of the skill profile and the recommendation engine. They never overwrite
 * verified assessment results and never map raw accuracy to a CEFR level.
 */
export interface PerformanceEvent {
    id: string
    skill: SkillName
    /** The exercise/step id. */
    activityId: string
    /** Containing lesson/topic/passage id, when there is one. */
    lessonId: string | null
    timestamp: number
    /** 1-5, from the content metadata; null when untagged. */
    difficulty: number | null
    result: 'correct' | 'incorrect'
    attemptCount: number
    /** Milliseconds spent, when the caller measured it; null otherwise. */
    timeSpent: number | null
    errorCategories: ErrorCategory[]
    /** Recognizer confidence etc., 0-1; null when not applicable. */
    confidence: number | null
}

export interface SkillPerformanceSummary {
    skill: SkillName
    totalEvents: number
    correct: number
    incorrect: number
    accuracy: number
    /** Activity ids answered wrong more than once — "repeated mistakes". */
    repeatedMistakes: string[]
    lastActivityAt: number | null
}
