import type { SkillName } from './skillProfile'

export type LearningActivityType =
    | 'daily-session'
    | 'speaking-practice'
    | 'guided-speaking'
    | 'hard-words-review'
    | 'grammar-review'
    | 'grammar-new'
    | 'listening-practice'
    | 'reading-practice'
    | 'writing-practice'

export interface LearningObjective {
    skill: SkillName
    description: string
}

export interface LearningActivity {
    type: LearningActivityType
    label: string
    route: string
    estimatedMinutes: number
    skill: SkillName
    /** Why this was picked — the whole point of "deterministic and explainable". */
    reason: string
}

export interface LearningRecommendation {
    generatedAt: number
    totalEstimatedMinutes: number
    objectives: LearningObjective[]
    activities: LearningActivity[]
}
