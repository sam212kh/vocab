import { describe, expect, it } from 'vitest'

import { countWords, validateAnswer } from './exerciseEngine'

import type {
    Exercise,
    FillBlankExercise,
    GrammarCorrectionExercise,
    MatchingExercise,
    MultipleChoiceExercise,
    SentenceOrderingExercise,
    WritingResponseExercise,
} from '../types/exercise'

const multipleChoice: MultipleChoiceExercise = {
    id: 'mc-1',
    type: 'multiple-choice',
    skill: 'grammar',
    prompt: 'Pick the correct form.',
    options: ['go', 'goes', 'going', 'gone'],
    correctIndex: 1,
    explanation: 'Third person singular takes -es.',
}

const fillBlank: FillBlankExercise = {
    id: 'fb-1',
    type: 'fill-blank',
    skill: 'grammar',
    before: 'She',
    after: 'to work every day.',
    acceptedAnswers: ['goes', 'walks'],
}

const grammarCorrection: GrammarCorrectionExercise = {
    id: 'gc-1',
    type: 'grammar-correction',
    skill: 'grammar',
    incorrectSentence: 'He go to school.',
    acceptedAnswers: ['He goes to school.'],
}

const ordering: SentenceOrderingExercise = {
    id: 'so-1',
    type: 'sentence-ordering',
    skill: 'grammar',
    segments: ['She', 'has', 'never', 'been', 'to', 'London'],
}

const matching: MatchingExercise = {
    id: 'ma-1',
    type: 'matching',
    skill: 'vocabulary',
    pairs: [
        { left: 'big', right: 'large' },
        { left: 'small', right: 'tiny' },
    ],
}

const writing: WritingResponseExercise = {
    id: 'wr-1',
    type: 'writing-response',
    skill: 'writing',
    prompt: 'Describe your morning routine.',
    minWords: 5,
    requiredElements: ['usually'],
}

describe('validateAnswer', () => {
    it('validates multiple choice by index', () => {
        expect(validateAnswer(multipleChoice, { kind: 'choice', index: 1 }).correct).toBe(true)
        expect(validateAnswer(multipleChoice, { kind: 'choice', index: 0 }).correct).toBe(false)
    })

    it('passes explanation through as feedback', () => {
        const result = validateAnswer(multipleChoice, { kind: 'choice', index: 0 })
        expect(result.feedback).toContain('Third person')
    })

    it('accepts any of the accepted answers for fill-blank, typo-tolerantly', () => {
        expect(validateAnswer(fillBlank, { kind: 'text', text: 'goes' }).correct).toBe(true)
        expect(validateAnswer(fillBlank, { kind: 'text', text: 'walks' }).correct).toBe(true)
        expect(validateAnswer(fillBlank, { kind: 'text', text: 'Goes' }).correct).toBe(true)
        expect(validateAnswer(fillBlank, { kind: 'text', text: 'runs' }).correct).toBe(false)
    })

    it('validates grammar correction against full-sentence accepted answers', () => {
        expect(
            validateAnswer(grammarCorrection, { kind: 'text', text: 'He goes to school.' }).correct
        ).toBe(true)
        expect(
            validateAnswer(grammarCorrection, { kind: 'text', text: 'He going to school.' }).correct
        ).toBe(false)
    })

    it('validates sentence ordering positionally', () => {
        expect(
            validateAnswer(ordering, { kind: 'ordering', order: [0, 1, 2, 3, 4, 5] }).correct
        ).toBe(true)
        expect(
            validateAnswer(ordering, { kind: 'ordering', order: [1, 0, 2, 3, 4, 5] }).correct
        ).toBe(false)
        expect(
            validateAnswer(ordering, { kind: 'ordering', order: [0, 1, 2] }).correct
        ).toBe(false)
    })

    it('validates matching pairs by index alignment', () => {
        expect(
            validateAnswer(matching, {
                kind: 'matching',
                matches: [
                    { leftIndex: 0, rightIndex: 0 },
                    { leftIndex: 1, rightIndex: 1 },
                ],
            }).correct
        ).toBe(true)

        expect(
            validateAnswer(matching, {
                kind: 'matching',
                matches: [
                    { leftIndex: 0, rightIndex: 1 },
                    { leftIndex: 1, rightIndex: 0 },
                ],
            }).correct
        ).toBe(false)
    })

    it('writing: enforces min words and required elements deterministically, with actionable feedback', () => {
        const tooShort = validateAnswer(writing, { kind: 'text', text: 'I wake up.' })
        expect(tooShort.correct).toBe(false)
        expect(tooShort.feedback).toContain('at least 5 words')

        const missingElement = validateAnswer(writing, {
            kind: 'text',
            text: 'I wake up at seven and eat breakfast.',
        })
        expect(missingElement.correct).toBe(false)
        expect(missingElement.feedback).toContain('usually')

        const good = validateAnswer(writing, {
            kind: 'text',
            text: 'I usually wake up at seven and eat breakfast.',
        })
        expect(good.correct).toBe(true)
    })

    it('rejects an answer whose shape does not match the exercise type', () => {
        const result = validateAnswer(multipleChoice as Exercise, { kind: 'text', text: 'goes' })
        expect(result.correct).toBe(false)
        expect(result.received).toBe('(invalid answer type)')
    })
})

describe('countWords', () => {
    it('counts whitespace-separated words, ignoring surrounding space', () => {
        expect(countWords('  hello   world  ')).toBe(2)
        expect(countWords('')).toBe(0)
        expect(countWords('one')).toBe(1)
    })
})
