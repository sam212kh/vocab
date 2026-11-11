import type { CefrLevel } from './cefr'
import type { ContentMetadata } from './vocabulary'
import type { MistakeCategory, MistakeKind } from './writing'

export type ConversationMode =
    | 'free'
    | 'daily-life'
    | 'professional'
    | 'interview'
    | 'workplace'
    | 'technical'
    | 'travel'
    | 'roleplay'

/** A = natural (no corrections), B = gentle (important errors only), C = teacher (structured). */
export type FeedbackMode = 'natural' | 'gentle' | 'teacher'

export interface ConversationCorrection {
    original: string
    corrected: string
    natural: string
    category: MistakeCategory
    kind: MistakeKind
    explanation: string
    explanationPersian: string
    example: string
}

export interface ConversationMessage {
    id: string
    role: 'learner' | 'tutor'
    text: string
    /** How the learner produced this message — voice evidence gates speaking events. */
    inputMethod: 'text' | 'voice' | null
    /** Recognizer confidence for voice input (0-1), null otherwise. */
    voiceConfidence: number | null
    corrections: ConversationCorrection[]
    /** Persian translation, filled only when the learner requested it. */
    translation: string | null
    timestamp: number
}

export interface ConversationSummary {
    overall: string
    strengths: string[]
    improvements: string[]
    corrections: Omit<ConversationCorrection, 'natural' | 'example'>[]
    usefulExpressions: { expression: string; meaning: string; meaningPersian: string }[]
    suggestedNextActivity: string
    provider: string
    model: string
    promptVersion: string
    generatedAt: number
}

export interface ConversationSession {
    id: string
    mode: ConversationMode
    scenarioId: string | null
    difficulty: CefrLevel
    feedbackMode: FeedbackMode
    startedAt: number
    endedAt: number | null
    messages: ConversationMessage[]
    summary: ConversationSummary | null
}

export interface RoleplayScenario extends ContentMetadata {
    id: string
    title: string
    mode: Exclude<ConversationMode, 'roleplay'> | 'roleplay'
    aiRole: string
    learnerRole: string
    objective: string
    context: string
    vocabulary?: string[]
    completionCriteria?: string
    /** Opening line the AI starts with (keeps session start instant + deterministic). */
    opening: string
}

export interface ScenarioManifest {
    version: number
    scenarios: RoleplayScenario[]
}

export interface SavedExpression {
    expression: string
    meaning: string
    meaningPersian: string
    sourceSessionId: string | null
    savedAt: number
}
