import type { LearningGoalType, StudyDay, StudyDurationMinutes } from '../types/learnerProfile'

/** Display labels shared by the Profile form and the onboarding flow, so they can never drift apart. */

export const GOAL_LABELS: Record<LearningGoalType, string> = {
    speaking: 'Speaking',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    'professional-english': 'Professional English',
    'travel-english': 'Travel English',
    'exam-preparation': 'Exam preparation',
}

export const GOAL_ORDER = Object.keys(GOAL_LABELS) as LearningGoalType[]

export const DAY_LABELS: Record<StudyDay, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

export const DAY_ORDER = Object.keys(DAY_LABELS) as StudyDay[]

export const ALL_DAYS: StudyDay[] = [...DAY_ORDER]

export const DURATIONS: StudyDurationMinutes[] = [5, 10, 15, 20, 30, 45, 60]
