import { describe, expect, it } from 'vitest'

import { calculateLessonProgress } from './lessonProgress'

import type { Word, WordProgress } from '../types/vocabulary'

function makeWord(word: string): Word {
    return {
        courseId: 'c', lessonId: 'l', word, meaning: '', level: '', pos: '',
        synonyms: [], examples: [], miniContext: '',
    }
}

function makeProgress(wordId: string, overrides: Partial<WordProgress> = {}): WordProgress {
    return {
        wordId, courseId: '', lessonId: '', status: 'new', level: 0, pos: '',
        correctAnswers: 0, wrongAnswers: 0, streak: 0, lastReviewedAt: null,
        nextReviewAt: null, practicePriority: 0, easeFactor: 2.5, intervalDays: 0,
        ...overrides,
    }
}

describe('calculateLessonProgress', () => {
    it('a recognized-but-never-answered word is not "studied" (passive vs active distinction)', () => {
        const words = [makeWord('hello')]
        const progress = [makeProgress('hello', { status: 'new', correctAnswers: 0, wrongAnswers: 0 })]

        const result = calculateLessonProgress(words, progress)

        expect(result.studiedWords).toBe(0)
    })

    it('a word is studied once answered at least once, even if still status "new"', () => {
        const words = [makeWord('hello')]
        const progress = [makeProgress('hello', { status: 'new', wrongAnswers: 1 })]

        const result = calculateLessonProgress(words, progress)

        expect(result.studiedWords).toBe(1)
        expect(result.masteredWords).toBe(0)
    })

    it('only "mastered" status counts toward masteryPercent', () => {
        const words = [makeWord('a'), makeWord('b')]
        const progress = [
            makeProgress('a', { status: 'mastered', correctAnswers: 5 }),
            makeProgress('b', { status: 'reviewing', correctAnswers: 2 }),
        ]

        const result = calculateLessonProgress(words, progress)

        expect(result.masteredWords).toBe(1)
        expect(result.masteryPercent).toBe(50)
    })

    it('returns 0% for an empty lesson instead of dividing by zero', () => {
        const result = calculateLessonProgress([], [])

        expect(result.completionPercent).toBe(0)
        expect(result.masteryPercent).toBe(0)
    })
})
