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

/**
 * Allows a 1-character typo tolerance for longer answers (a missed/extra
 * letter shouldn't break an SRS streak the way a genuinely wrong answer
 * should). Short answers (<4 chars) still require an exact match, since a
 * 1-edit tolerance on something like "cat" would accept "cut" or "cot".
 */
export function answersMatch(
    target: string,
    answer: string
): boolean {
    const normalizedTarget = normalizeAnswer(target)
    const normalizedAnswer = normalizeAnswer(answer)

    if (normalizedTarget === normalizedAnswer) {
        return true
    }

    if (normalizedTarget.length < 4 || !normalizedAnswer) {
        return false
    }

    return levenshtein(normalizedTarget, normalizedAnswer) <= 1
}
