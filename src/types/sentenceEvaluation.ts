export const SENTENCE_EVALUATION_SCHEMA = 'sentence-evaluation-v1'

export const SENTENCE_DIMENSIONS = [
    'grammar',
    'meaning',
    'vocabulary',
    'wordOrder',
    'naturalness',
    'targetExpression',
    'contextRelevance',
] as const

export type SentenceDimension = (typeof SENTENCE_DIMENSIONS)[number]

export type DimensionStatus = 'ok' | 'minor' | 'problem' | 'not-applicable'

export type SentenceOutcome =
    | 'correct'
    | 'valid-alternative'
    | 'unnatural'
    | 'needs-correction'
    | 'meaning-changed'
    | 'off-topic'
    | 'incomplete'

export type SentenceIssue =
    | 'incomplete'
    | 'meaning'
    | 'off-topic'
    | 'grammar'
    | 'word-order'
    | 'vocabulary'
    | 'unnatural'

export interface SentenceError {
    dimension: SentenceDimension
    /** Exact text from the learner's sentence ('' for whole-sentence issues). */
    fragment: string
    start: number | null
    end: number | null
    explanation: string
    explanationPersian: string
    suggestion: string
}

/** Validated server-side; outcome/issues/passed are DERIVED there, never model-asserted. */
export interface SentenceEvaluation {
    schemaVersion: typeof SENTENCE_EVALUATION_SCHEMA
    /** Exact learner text, echoed from the request. */
    learnerSentence: string
    outcome: SentenceOutcome
    /** Complete, relevant, meaning-preserving and language-correct (unnaturalness alone still passes). */
    passed: boolean
    issues: SentenceIssue[]
    /** Language correctness and content quality are reported separately. */
    language: { correct: boolean; natural: boolean }
    content: {
        complete: boolean
        meaningPreserved: boolean
        relevant: boolean
        targetUsed: boolean | null
        usedTargets: string[]
    }
    matchesReference: boolean
    dimensions: Record<SentenceDimension, { status: DimensionStatus; note: string }>
    errors: SentenceError[]
    /** '' when nothing needs fixing. */
    correctedSentence: string
    explanationPersian: string
    alternatives: string[]
    example: string
    nextPractice: string
}

export interface SentenceEvaluationRequest {
    learnerSentence: string
    taskType: 'open' | 'translate'
    promptPersian: string
    promptEnglish: string
    situation?: string
    targetExpressions: string[]
    referenceSentences: string[]
    explanationLanguage: 'english' | 'persian' | 'bilingual'
    provider?: 'ollama' | 'cloud'
    model?: string
    allowFallback: boolean
    learner: { selfReportedLevel: string }
}
