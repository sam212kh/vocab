import type { ContentMetadata } from './vocabulary'
import type { Exercise } from './exercise'

/**
 * Real-Life English: everyday situations taught as phrases-in-context.
 * Content is manifest-driven (public/data/real-life/), one JSON per
 * scenario, following the grammar/reading module conventions.
 */

export type RealLifeCategory =
    | 'kitchen'
    | 'home'
    | 'shopping'
    | 'restaurant'
    | 'travel'
    | 'social'
    | 'personal-care'
    | 'work'
    | 'phone'
    | 'daily-routine'

export interface RealLifeScenarioManifest extends ContentMetadata {
    id: string
    title: string
    titlePersian: string
    category: RealLifeCategory
    /** Emoji used as the scenario illustration (no image assets exist). */
    icon: string
    file: string
}

export interface RealLifeManifest {
    version: number
    scenarios: RealLifeScenarioManifest[]
}

export interface RealLifeExpression {
    /** The phrase/collocation itself (not an isolated dictionary word). */
    english: string
    persian: string
    /** Contextual example sentence using the expression. */
    example: string
    examplePersian: string
    /** Naturalness/usage note, when genuinely useful. */
    note?: string
}

export interface RealLifeSpeakingTask {
    /** What to say/describe aloud. */
    instruction: string
    instructionPersian: string
    /** Model sentences — transcript-compared (scored as match, never as pronunciation). */
    modelSentences: string[]
}

export interface RealLifeRoleplay {
    aiRole: string
    learnerRole: string
    objective: string
    context: string
    opening: string
    vocabulary: string[]
}

export interface RealLifeScenario {
    id: string
    title: string
    titlePersian: string
    /** Step 1 — See: bilingual context introduction. */
    context: string
    contextPersian: string
    /** Step 2/3 — Learn + Listen. */
    expressions: RealLifeExpression[]
    /** Step 4 — Practice (unified exercise engine). */
    exercises: Exercise[]
    /** Step 5 — Speak. */
    speakingTask: RealLifeSpeakingTask
    /** Step 6 — Use (runs through the existing Conversation Tutor). */
    roleplay: RealLifeRoleplay
}

/* ---------- My Real Life (AI-assisted expression) ---------- */

export interface ExpressionHelp {
    /** What the learner originally typed (Persian or English). */
    input: string
    /** Word-for-word rendering — labeled literal, may be unnatural. */
    literal: string
    /** How a native speaker would actually say it. */
    natural: string
    naturalPersian: string
    /** A more advanced/alternative way to say it. */
    advanced: string
    advancedPersian: string
    vocabulary: { english: string; persian: string }[]
    relatedExamples: { english: string; persian: string }[]
    followUpExercises: {
        type: 'grammar-correction' | 'fill-blank' | 'short-answer'
        prompt: string
        acceptedAnswers: string[]
        explanation: string
    }[]
    provider: string
    model: string
    generatedAt: number
}
