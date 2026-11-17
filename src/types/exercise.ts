import type { SkillName } from './skillProfile'

/**
 * Unified exercise model shared by the Grammar, Reading, Listening and
 * Writing modules. One discriminated union + one pure validation service
 * (services/exerciseEngine.ts) replaces the per-view question/validation
 * logic the older vocabulary views each reimplemented.
 *
 * Content lives in JSON under public/data/ — never inside Vue components.
 */

export type ExerciseType =
    | 'multiple-choice'
    | 'fill-blank'
    | 'translation'
    | 'sentence-ordering'
    | 'matching'
    | 'short-answer'
    | 'listening-comprehension'
    | 'dictation'
    | 'grammar-correction'
    | 'reading-comprehension'
    | 'writing-response'

export interface ExerciseBase {
    id: string
    type: ExerciseType
    skill: SkillName
    /** CEFR reference (may be a range like "A2-B1"). Optional — absent means untagged, not "A1". */
    cefrLevel?: string
    /** 1 (easiest) – 5 (hardest). Relative within its module, not a CEFR claim. */
    difficulty?: number
    /** Id of the learning objective (declared in the topic's manifest entry) this exercise assesses. */
    objectiveId?: string
    /** Expressions this exercise gives evidence for. Recorded against the Phase 9 ledger as `lex:` items. */
    targets?: string[]
    /** Shown after answering, regardless of correctness. */
    explanation?: string
    explanationPersian?: string
}

/** Optional help and feedback for exercises the learner answers by typing. */
export interface TypedExtras {
    /** Shown on request. Using it makes the answer hint-assisted, not independent. */
    hint?: string
    hintPersian?: string
    /** Grammatical and understandable, but less natural than acceptedAnswers: counts as correct with a note. */
    acceptableAnswers?: AcceptableAnswer[]
    /** Targeted feedback for a specific wrong answer (matched case-insensitively against what was typed). */
    commonErrors?: CommonError[]
}

export interface AcceptableAnswer {
    text: string
    note: string
    notePersian?: string
}

export interface CommonError {
    /** Regular-expression source, tested case-insensitively against the learner's answer. */
    match: string
    feedback: string
    feedbackPersian: string
}

export interface MultipleChoiceExercise extends ExerciseBase {
    type: 'multiple-choice'
    prompt: string
    options: string[]
    /** Index into options. */
    correctIndex: number
}

export interface FillBlankExercise extends ExerciseBase, TypedExtras {
    type: 'fill-blank'
    /** Text before/after the blank. */
    before: string
    after: string
    /** Any of these count as correct (first is the canonical display answer). */
    acceptedAnswers: string[]
}

export interface TranslationExercise extends ExerciseBase, TypedExtras {
    type: 'translation'
    /** Source text (usually Persian). */
    source: string
    sourceLang: 'fa' | 'en'
    acceptedAnswers: string[]
}

export interface SentenceOrderingExercise extends ExerciseBase {
    type: 'sentence-ordering'
    /** Segments in CORRECT order; the player shuffles for display. */
    segments: string[]
}

export interface MatchingExercise extends ExerciseBase {
    type: 'matching'
    pairs: { left: string; right: string }[]
}

export interface ShortAnswerExercise extends ExerciseBase, TypedExtras {
    type: 'short-answer'
    prompt: string
    acceptedAnswers: string[]
}

export interface ListeningComprehensionExercise extends ExerciseBase {
    type: 'listening-comprehension'
    /** Text spoken via the existing TTS service — the learner hears, not reads it. */
    audioText: string
    prompt: string
    options: string[]
    correctIndex: number
}

export interface DictationExercise extends ExerciseBase {
    type: 'dictation'
    /** Spoken via TTS; the learner types what they hear. */
    audioText: string
    /** Usually just [audioText]; variants allow for contractions etc. */
    acceptedAnswers: string[]
}

export interface GrammarCorrectionExercise extends ExerciseBase, TypedExtras {
    type: 'grammar-correction'
    incorrectSentence: string
    acceptedAnswers: string[]
}

export interface ReadingComprehensionExercise extends ExerciseBase {
    type: 'reading-comprehension'
    prompt: string
    options: string[]
    correctIndex: number
    comprehensionKind?:
        | 'main-idea'
        | 'specific-information'
        | 'inference'
        | 'vocabulary-in-context'
        | 'sentence-comprehension'
        | 'summary'
}

export interface WritingResponseExercise extends ExerciseBase {
    type: 'writing-response'
    prompt: string
    /** Deterministic constraints only — real quality feedback needs the future AI service. */
    minWords?: number
    maxWords?: number
    /** Words/structures the response should contain (checked case-insensitively). */
    requiredElements?: string[]
}

export type Exercise =
    | MultipleChoiceExercise
    | FillBlankExercise
    | TranslationExercise
    | SentenceOrderingExercise
    | MatchingExercise
    | ShortAnswerExercise
    | ListeningComprehensionExercise
    | DictationExercise
    | GrammarCorrectionExercise
    | ReadingComprehensionExercise
    | WritingResponseExercise

/** What the learner submitted, shaped per exercise type. */
export type ExerciseAnswer =
    | { kind: 'choice'; index: number }
    | { kind: 'text'; text: string }
    | { kind: 'ordering'; order: number[] }
    | { kind: 'matching'; matches: { leftIndex: number; rightIndex: number }[] }

export interface ExerciseResult {
    exerciseId: string
    correct: boolean
    /** Canonical correct answer for display. */
    expected: string
    /** The learner asked for the hint before answering. Such an answer is not independent. */
    hintUsed?: boolean
    /** Correct but a less natural wording than the canonical answer. */
    naturalness?: 'natural' | 'acceptable'
    naturalnessNote?: string
    naturalnessNotePersian?: string
    /** Targeted feedback for a recognised wrong answer. */
    errorFeedback?: { english: string; persian: string }
    /** What the learner's answer looked like, normalized for display. */
    received: string
    feedback?: string
}
