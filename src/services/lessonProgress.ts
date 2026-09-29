import type {
    Word,
} from '../types/vocabulary'

import type {
    WordProgress,
} from '../types/vocabulary'

export interface LessonProgress {
    totalWords: number
    studiedWords: number
    masteredWords: number
    completionPercent: number
    masteryPercent: number
}

export function calculateLessonProgress(
    words: Word[],
    progress: WordProgress[]
): LessonProgress {
    const progressMap =
        new Map<string, WordProgress>()

    for (const item of progress) {
        progressMap.set(
            normalizeWord(item.wordId),
            item
        )
    }

    let studiedWords = 0
    let masteredWords = 0

    for (const word of words) {
        const item =
            progressMap.get(
                normalizeWord(word.word)
            )

        if (!item) {
            continue
        }

        /*
         * A word is considered studied
         * once it has been answered at
         * least once or moved beyond new.
         */
        const studied =
            item.status !== 'new' ||
            item.correctAnswers > 0 ||
            item.wrongAnswers > 0

        if (studied) {
            studiedWords++
        }

        if (
            item.status === 'mastered'
        ) {
            masteredWords++
        }
    }

    const totalWords = words.length

    return {
        totalWords,

        studiedWords,

        masteredWords,

        completionPercent:
            totalWords === 0
                ? 0
                : Math.round(
                    (studiedWords /
                        totalWords) *
                    100
                ),

        masteryPercent:
            totalWords === 0
                ? 0
                : Math.round(
                    (masteredWords /
                        totalWords) *
                    100
                ),
    }
}

function normalizeWord(
    word: string
): string {
    return word
        .trim()
        .toLowerCase()
}