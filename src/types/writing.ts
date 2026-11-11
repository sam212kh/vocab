import type { ContentMetadata } from './vocabulary'

export type WritingPromptType =
    | 'sentence'
    | 'paragraph'
    | 'journal'
    | 'email'
    | 'professional'
    | 'opinion'
    | 'summary'
    | 'technical'
    | 'essay'

export interface WritingPrompt extends ContentMetadata {
    id: string
    title: string
    promptType: WritingPromptType
    instructions: string
    instructionsPersian?: string
    minWords?: number
    maxWords?: number
    /** Words/structures the learner should try to use (checked deterministically). */
    requiredElements?: string[]
    /** Shown AFTER submission as a model — never before writing. */
    exampleResponse?: string
}

export interface WritingManifest {
    version: number
    prompts: WritingPrompt[]
}

export interface WritingSubmission {
    id: string
    promptId: string
    /** Immutable — evaluations never modify the learner's original text. */
    text: string
    wordCount: number
    submittedAt: number
    /** Result of deterministic constraint checks only. */
    constraintsPassed: boolean
    constraintIssues: string[]
    /**
     * AI evaluations of this submission, oldest first. A retry appends a new
     * entry — previous evaluations are never overwritten. Empty until the
     * learner requests one. Never fabricated.
     */
    evaluations: WritingEvaluation[]
}

export type MistakeCategory =
    | 'tense'
    | 'articles'
    | 'prepositions'
    | 'subject-verb-agreement'
    | 'word-order'
    | 'sentence-fragment'
    | 'run-on'
    | 'word-choice'
    | 'collocation'
    | 'spelling'
    | 'punctuation'
    | 'coherence'
    | 'register'
    | 'naturalness'
    | 'other'

/** 'error' = actual mistake; 'style' = valid English that could be more natural. */
export type MistakeKind = 'error' | 'style'

export type EvaluationDimension =
    | 'grammar'
    | 'vocabulary'
    | 'sentence-structure'
    | 'coherence'
    | 'naturalness'
    | 'clarity'
    | 'task-completion'

export interface DimensionFeedback {
    dimension: EvaluationDimension
    assessment: string
    evidence: string
    suggestion: string
}

export interface SentenceFeedback {
    /** Verbatim from the learner's submission (gateway-verified). */
    original: string
    corrected: string
    category: MistakeCategory
    kind: MistakeKind
    explanation: string
    explanationPersian: string
    example: string
}

export interface VocabularySuggestion {
    original: string
    suggestion: string
    reason: string
    kind: MistakeKind
}

export interface FollowUpExercise {
    type: 'grammar-correction' | 'fill-blank' | 'short-answer'
    prompt: string
    acceptedAnswers: string[]
    explanation: string
}

/**
 * One validated AI evaluation. Produced only by a real model behind the AI
 * gateway — teaching feedback, never a certified CEFR assessment.
 */
export interface WritingEvaluation {
    provider: string
    model: string
    promptVersion: string
    evaluatedAt: number
    durationMs: number
    /** True when the gateway used the explicitly-allowed fallback provider. */
    fallbackUsed: boolean
    overall: string
    correctedVersion: string
    naturalVersion: string
    dimensions: DimensionFeedback[]
    sentences: SentenceFeedback[]
    vocabulary: VocabularySuggestion[]
    priorities: string[]
    followUpExercises: FollowUpExercise[]
}

export interface WritingEvaluationRequest {
    prompt: WritingPrompt
    text: string
}

/** The interface an AI writing service implements (consumed by the Writing view). */
export interface WritingEvaluator {
    evaluate(prompt: WritingPrompt, text: string): Promise<WritingEvaluation>
}
