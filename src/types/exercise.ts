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
    learningObjective?: string
    /** Shown after answering, regardless of correctness. */
    explanation?: string
    explanationPersian?: string
}

export interface MultipleChoiceExercise extends ExerciseBase {
    type: 'multiple-choice'
    prompt: string
    options: string[]
    /** Index into options. */
    correctIndex: number
}

export interface FillBlankExercise extends ExerciseBase {
    type: 'fill-blank'
    /** Text before/after the blank. */
    before: string
    after: string
    /** Any of these count as correct (first is the canonical display answer). */
    acceptedAnswers: string[]
    hint?: string
}

export interface TranslationExercise extends ExerciseBase {
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

export interface ShortAnswerExercise extends ExerciseBase {
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

export interface GrammarCorrectionExercise extends ExerciseBase {
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
    /** What the learner's answer looked like, normalized for display. */
    received: string
    feedback?: string
}
