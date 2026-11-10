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
    text: string
    wordCount: number
    submittedAt: number
    /** Result of deterministic constraint checks only. */
    constraintsPassed: boolean
    constraintIssues: string[]
    /** Filled by a future AI evaluator — null until one exists. Never fabricated. */
    evaluation: WritingEvaluation | null
}

/**
 * Provider-independent evaluation contract. A future AI service (local model
 * or remote provider behind an adapter, mirroring how services/speech.ts
 * abstracts TTS engines) returns this shape. Nothing in the current app
 * fabricates these fields — deterministic constraint checks live separately
 * on WritingSubmission.
 */
export interface WritingEvaluation {
    /** Where this evaluation came from, e.g. "local-llm", "remote-api". */
    provider: string
    evaluatedAt: number
    correctedVersion: string
    naturalAlternative?: string
    mistakes: WritingMistake[]
    suggestedPractice?: string[]
}

export interface WritingMistake {
    category: 'grammar' | 'vocabulary' | 'structure' | 'coherence' | 'clarity' | 'naturalness' | 'task-completion'
    original: string
    correction: string
    explanation: string
}

/** The interface a future AI writing service must implement. */
export interface WritingEvaluator {
    readonly provider: string
    evaluate(prompt: WritingPrompt, text: string): Promise<WritingEvaluation>
}
