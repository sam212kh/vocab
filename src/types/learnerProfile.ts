import type { CefrLevel } from './cefr'

export type LearningGoalType =
    | 'speaking'
    | 'listening'
    | 'reading'
    | 'writing'
    | 'vocabulary'
    | 'grammar'
    | 'professional-english'
    | 'travel-english'
    | 'exam-preparation'

export interface LearningGoal {
    type: LearningGoalType
    /** Lower number = higher priority. Order reflects the order the learner picked them in. */
    priority: number
}

export type StudyDay =
    | 'mon'
    | 'tue'
    | 'wed'
    | 'thu'
    | 'fri'
    | 'sat'
    | 'sun'

export type StudyDurationMinutes = 15 | 30 | 45 | 60

export type ExplanationLanguage = 'persian' | 'english' | 'bilingual'

export interface LearnerProfile {
    nativeLanguage: string
    targetLanguage: string
    goals: LearningGoal[]
    studyDurationMinutes: StudyDurationMinutes
    studyDays: StudyDay[]
    interests: string[]
    explanationLanguage: ExplanationLanguage
    /**
     * Rough, unverified starting point only — explicitly NOT a certified or
     * assessed level. Used solely to seed SkillProfile initial estimates
     * until a real assessment exists (Phase 2.3 / later placement test).
     */
    selfReportedLevel: CefrLevel | null
    /** Learning program selected from Phase 2+ program management (not implemented yet). */
    selectedProgramId: string | null
    createdAt: number
    updatedAt: number
}

export function createDefaultLearnerProfile(now = Date.now()): LearnerProfile {
    return {
        nativeLanguage: 'Persian',
        targetLanguage: 'English',
        goals: [
            { type: 'speaking', priority: 1 },
            { type: 'listening', priority: 2 },
            { type: 'professional-english', priority: 3 },
        ],
        studyDurationMinutes: 45,
        studyDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        interests: [],
        explanationLanguage: 'bilingual',
        /*
         * Default is an approximate, unverified starting point (roughly
         * B1-B2) rather than null, since this app currently has one known
         * primary learner. It is fully editable and never read by learning
         * logic directly — only used to seed SkillProfile initial estimates.
         */
        selfReportedLevel: 'B1',
        selectedProgramId: null,
        createdAt: now,
        updatedAt: now,
    }
}
