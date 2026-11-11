export function normalizeAnswer(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + 1
                )
            }
        }
    }

    return matrix[b.length][a.length]
}

import { normalizeNumbersInText } from './numbers'

export interface AnswersMatchOptions {
    /**
     * When true, numeric digits and their written English forms compare
     * equal ("10" ≡ "ten", "1,000" ≡ "one thousand"). Different values
     * still never match. Off by default — enabled per exercise type by
     * the exercise engine, not blindly everywhere.
     */
    numberEquivalence?: boolean
    /**
     * When true, the answer must equal an accepted answer after safe
     * normalization (case/punctuation/whitespace) — NO typo tolerance.
     * Required for grammar-correction: the mistake being corrected is
     * often exactly one edit away from the correct sentence, so a 1-edit
     * tolerance would accept the uncorrected original.
     */
    exact?: boolean
}

/**
 * Allows a 1-character typo tolerance for longer answers (a missed/extra
 * letter shouldn't break an SRS streak the way a genuinely wrong answer
 * should). Short answers (<4 chars) still require an exact match, since a
 * 1-edit tolerance on something like "cat" would accept "cut" or "cot".
 */
export function answersMatch(
    target: string,
    answer: string,
    options: AnswersMatchOptions = {}
): boolean {
    const normalizedTarget = options.numberEquivalence
        ? normalizeNumbersInText(target)
        : normalizeAnswer(target)

    const normalizedAnswer = options.numberEquivalence
        ? normalizeNumbersInText(answer)
        : normalizeAnswer(answer)

    /* An exact match after safe normalization is ALWAYS correct. */
    if (normalizedTarget === normalizedAnswer) {
        return true
    }

    if (options.exact) {
        return false
    }

    if (normalizedTarget.length < 4 || !normalizedAnswer) {
        return false
    }

    /*
     * Typo tolerance must never bridge a difference in numeric values:
     * "10 minutes" vs "12 minutes" is one edit apart but a different
     * answer, not a typo.
     */
    if (digitSequence(normalizedTarget) !== digitSequence(normalizedAnswer)) {
        return false
    }

    return levenshtein(normalizedTarget, normalizedAnswer) <= 1
}

function digitSequence(value: string): string {
    return (value.match(/\d+(?:\.\d+)?/g) ?? []).join(' ')
}
