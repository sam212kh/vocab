import { normalizeAnswer } from './textMatch'

/**
 * Deterministic word-level analysis of a text answer against accepted
 * answers — separates WHAT was wrong from the binary correct/incorrect
 * verdict (which stays in exerciseEngine, unchanged).
 *
 * Dimensions reported:
 * - wording: token-level corrections against the CLOSEST accepted answer
 *   (so "He studies..." is compared to the He-variant, not the She-variant)
 * - meaning: how much of the expected answer the learner produced, plus a
 *   subject-pronoun check (a changed subject changes the meaning of a
 *   translation even when the grammar is fine)
 *
 * All heuristic labels are deliberately modest — this is a word diff, not
 * a parser, and it never claims grammatical analysis it can't do.
 */

export type TokenOp =
    | { type: 'keep'; text: string }
    | { type: 'replace'; learner: string; expected: string }
    | { type: 'missing'; expected: string }
    | { type: 'extra'; learner: string }

export type MeaningAssessment = 'match' | 'subject-differs' | 'close' | 'different'

export interface AnswerAnalysis {
    /** The accepted answer closest to what the learner wrote (display form). */
    closestAccepted: string
    ops: TokenOp[]
    corrections: TokenOp[]
    /** Fraction of expected tokens the learner got (0-1). */
    matchRatio: number
    meaning: MeaningAssessment
}

const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they'])

function tokens(value: string): string[] {
    return value.split(/\s+/).filter(Boolean)
}

function normalizedTokens(value: string): string[] {
    return tokens(normalizeAnswer(value))
}

/** Word-level Levenshtein alignment returning the op sequence. */
function alignTokens(expected: string[], learner: string[]): TokenOp[] {
    const rows = expected.length + 1
    const cols = learner.length + 1

    const cost: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))

    for (let i = 0; i < rows; i++) cost[i][0] = i
    for (let j = 0; j < cols; j++) cost[0][j] = j

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            cost[i][j] = expected[i - 1] === learner[j - 1]
                ? cost[i - 1][j - 1]
                : Math.min(cost[i - 1][j - 1], cost[i - 1][j], cost[i][j - 1]) + 1
        }
    }

    /* Backtrack. */
    const ops: TokenOp[] = []
    let i = expected.length
    let j = learner.length

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && expected[i - 1] === learner[j - 1]) {
            ops.unshift({ type: 'keep', text: expected[i - 1] })
            i--
            j--
        } else if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + 1) {
            ops.unshift({ type: 'replace', learner: learner[j - 1], expected: expected[i - 1] })
            i--
            j--
        } else if (i > 0 && (j === 0 || cost[i][j] === cost[i - 1][j] + 1)) {
            ops.unshift({ type: 'missing', expected: expected[i - 1] })
            i--
        } else {
            ops.unshift({ type: 'extra', learner: learner[j - 1] })
            j--
        }
    }

    return ops
}

function editDistance(expected: string[], learner: string[]): number {
    return alignTokens(expected, learner).filter(op => op.type !== 'keep').length
}

export function analyzeTextAnswer(
    acceptedAnswers: string[],
    learnerAnswer: string
): AnswerAnalysis | null {
    const learner = normalizedTokens(learnerAnswer)

    if (!acceptedAnswers.length) return null

    /* Pick the accepted answer with the smallest word-level distance. */
    let closestAccepted = acceptedAnswers[0]
    let bestDistance = Infinity

    for (const accepted of acceptedAnswers) {
        const distance = editDistance(normalizedTokens(accepted), learner)

        if (distance < bestDistance) {
            bestDistance = distance
            closestAccepted = accepted
        }
    }

    const expected = normalizedTokens(closestAccepted)
    const ops = alignTokens(expected, learner)
    const corrections = ops.filter(op => op.type !== 'keep')

    const kept = ops.filter(op => op.type === 'keep').length
    const matchRatio = expected.length ? kept / expected.length : 0

    /*
     * Subject check: if the learner's first word is a pronoun that differs
     * from the closest answer's first word AND is not the first word of ANY
     * accepted variant, the SUBJECT of the sentence changed — a meaning
     * difference (relevant for translations of an unambiguous prompt), not
     * just a wording slip.
     */
    const learnerSubject = learner[0]
    const acceptedSubjects = new Set(
        acceptedAnswers.map(answer => normalizedTokens(answer)[0]).filter(Boolean)
    )

    const subjectDiffers =
        learnerSubject !== undefined &&
        PRONOUNS.has(learnerSubject) &&
        !acceptedSubjects.has(learnerSubject) &&
        acceptedSubjects.size > 0 &&
        [...acceptedSubjects].some(subject => PRONOUNS.has(subject))

    let meaning: MeaningAssessment

    if (subjectDiffers) meaning = 'subject-differs'
    else if (corrections.length === 0) meaning = 'match'
    else if (matchRatio >= 0.7) meaning = 'close'
    else meaning = 'different'

    return { closestAccepted, ops, corrections, matchRatio, meaning }
}
