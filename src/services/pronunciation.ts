export interface PronunciationResult {
    score: number
    normalizedTarget: string
    normalizedTranscript: string
    correct: boolean
}

function normalize(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/[.,!?;:'"()]/g, '')
        .replace(/\s+/g, ' ')
}

function levenshtein(
    a: string,
    b: string
): number {
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
                matrix[i][j] =
                    matrix[i - 1][j - 1]
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

export function checkPronunciation(
    target: string,
    transcript: string
): PronunciationResult {
    const normalizedTarget =
        normalize(target)

    const normalizedTranscript =
        normalize(transcript)

    if (!normalizedTarget) {
        return {
            score: 0,
            normalizedTarget,
            normalizedTranscript,
            correct: false,
        }
    }

    if (
        normalizedTarget ===
        normalizedTranscript
    ) {
        return {
            score: 100,
            normalizedTarget,
            normalizedTranscript,
            correct: true,
        }
    }

    const distance = levenshtein(
        normalizedTarget,
        normalizedTranscript
    )

    const maxLength = Math.max(
        normalizedTarget.length,
        normalizedTranscript.length
    )

    const score = Math.max(
        0,
        Math.round(
            (1 - distance / maxLength) * 100
        )
    )

    return {
        score,
        normalizedTarget,
        normalizedTranscript,
        correct: score >= 80,
    }
}