import type { ProductionAssistance } from '../types/journey'

/**
 * Pure classification of HOW a production answer came about. Only
 * 'none' is independent production: a hint, a retry after feedback, or a
 * reproduced correction each weaken what the answer can evidence.
 */

export interface ProductionAttemptContext {
    /** 1 = first attempt at this prompt. */
    attempt: number
    hintUsed: boolean
    /** The correction the learner has actually SEEN before this attempt, else null. */
    seenCorrection: string | null
}

export const FIRST_ATTEMPT: ProductionAttemptContext = { attempt: 1, hintUsed: false, seenCorrection: null }

function words(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
}

export function normalizeSentence(text: string): string {
    return words(text).join(' ')
}

function dice(a: string, b: string): number {
    const left = new Set(words(a))
    const right = new Set(words(b))

    if (!left.size || !right.size) return 0

    let shared = 0

    for (const word of left) if (right.has(word)) shared++

    return (2 * shared) / (left.size + right.size)
}

/** Same words, or (almost) the correction the learner was just shown. Heuristic. */
const COPY_SIMILARITY = 0.85

export function classifyAssistance(sentence: string, context: ProductionAttemptContext): ProductionAssistance {
    const seen = context.seenCorrection

    if (seen && (normalizeSentence(sentence) === normalizeSentence(seen) || dice(sentence, seen) >= COPY_SIMILARITY)) {
        return 'copied-correction'
    }

    if (context.attempt > 1) return 'after-feedback'

    return context.hintUsed ? 'hint' : 'none'
}
