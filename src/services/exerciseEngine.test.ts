import { describe, expect, it } from 'vitest'

import { countWords, validateAnswer } from './exerciseEngine'

import type {
    Exercise,
    ExerciseAnswer,
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

describe('exact-answer regression (learner answer must never be marked wrong when identical)', () => {
    const correctSentence: GrammarCorrectionExercise = {
        id: 'gc-movie',
        type: 'grammar-correction',
        skill: 'grammar',
        incorrectSentence: 'I saw an movie last night.',
        acceptedAnswers: ['I saw a movie last night.'],
    }

    it('the exact accepted answer is correct, with and without final punctuation', () => {
        expect(validateAnswer(correctSentence, { kind: 'text', text: 'I saw a movie last night.' }).correct).toBe(true)
        expect(validateAnswer(correctSentence, { kind: 'text', text: 'I saw a movie last night' }).correct).toBe(true)
        expect(validateAnswer(correctSentence, { kind: 'text', text: 'i saw a movie last night.' }).correct).toBe(true)
    })

    it('the UNCORRECTED original sentence stays incorrect (no typo tolerance for grammar-correction)', () => {
        expect(validateAnswer(correctSentence, { kind: 'text', text: 'I saw an movie last night.' }).correct).toBe(false)
    })

    it('the learner answer is preserved verbatim and the expected answer is independent', () => {
        const result = validateAnswer(correctSentence, { kind: 'text', text: 'I saw an movie last night.' })

        expect(result.received).toBe('I saw an movie last night.')
        expect(result.expected).toBe('I saw a movie last night.')
        expect(result.received).not.toBe(result.expected)
    })

    it('repeated validations are independent — a previous attempt cannot affect the current one', () => {
        const wrong = validateAnswer(correctSentence, { kind: 'text', text: 'I saw an movie last night.' })
        const right = validateAnswer(correctSentence, { kind: 'text', text: 'I saw a movie last night.' })
        const wrongAgain = validateAnswer(correctSentence, { kind: 'text', text: 'totally different' })

        expect(wrong.correct).toBe(false)
        expect(right.correct).toBe(true)
        expect(wrongAgain.correct).toBe(false)
        expect(right.received).toBe('I saw a movie last night.')
        expect(wrongAgain.received).toBe('totally different')
    })

    it('selecting the correct multiple-choice option is correct and received shows the chosen label', () => {
        const result = validateAnswer(multipleChoice, { kind: 'choice', index: 1 })

        expect(result.correct).toBe(true)
        expect(result.received).toBe('goes')

        const wrong = validateAnswer(multipleChoice, { kind: 'choice', index: 0 })
        expect(wrong.correct).toBe(false)
        expect(wrong.received).toBe('go')
        expect(wrong.expected).toBe('goes')
    })

    it('matching shows the learner actual pairing, not a placeholder', () => {
        const result = validateAnswer(matching, {
            kind: 'matching',
            matches: [
                { leftIndex: 0, rightIndex: 1 },
                { leftIndex: 1, rightIndex: 0 },
            ],
        })

        expect(result.correct).toBe(false)
        expect(result.received).toBe('big → tiny, small → large')
    })
})

describe('countWords', () => {
    it('counts whitespace-separated words, ignoring surrounding space', () => {
        expect(countWords('  hello   world  ')).toBe(2)
        expect(countWords('')).toBe(0)
        expect(countWords('one')).toBe(1)
    })
})

describe('typed-answer extras (Phase 10)', () => {
    const translation: Exercise = {
        id: 't1', type: 'translation', skill: 'vocabulary', source: 'می‌شود به من کمک کنی؟', sourceLang: 'fa',
        acceptedAnswers: ['Could you help me?', 'Can you help me?'],
        acceptableAnswers: [{ text: 'Are you able to help me?', note: 'Correct, but it sounds formal for a casual request.', notePersian: 'درست است، اما برای درخواست دوستانه رسمی است.' }],
        commonErrors: [{ match: 'can you to help', feedback: 'After "can you" use the base verb, without "to".', feedbackPersian: 'بعد از can you فعل ساده می‌آید، بدون to.' }, { match: '([unclosed', feedback: 'x', feedbackPersian: 'x' }],
    }
    const text = (value: string): ExerciseAnswer => ({ kind: 'text', text: value })

    it('accepts any listed alternative, not only the canonical wording', () => {
        expect(validateAnswer(translation, text('Can you help me?')).correct).toBe(true)
        expect(validateAnswer(translation, text('could you help me')).correct).toBe(true)
    })

    it('a grammatical but less natural answer is correct and flagged, with Persian note', () => {
        const result = validateAnswer(translation, text('Are you able to help me?'))

        expect(result.correct).toBe(true)
        expect(result.naturalness).toBe('acceptable')
        expect(result.naturalnessNote).toMatch(/formal/)
        expect(result.naturalnessNotePersian).toMatch(/[؀-ۿ]/)
    })

    it('a natural answer is marked natural and carries no note', () => {
        const result = validateAnswer(translation, text('Could you help me?'))

        expect(result.naturalness).toBe('natural')
        expect(result.naturalnessNote).toBeUndefined()
    })

    it('a recognised wrong answer gets targeted bilingual feedback and keeps the learner’s original text', () => {
        const result = validateAnswer(translation, text('  Can you to help me?  '))

        expect(result.correct).toBe(false)
        expect(result.errorFeedback?.persian).toMatch(/[؀-ۿ]/)
        expect(result.received).toBe('Can you to help me?')
    })

    it('an unrecognised wrong answer has no targeted feedback, and a malformed pattern never throws', () => {
        const result = validateAnswer(translation, text('Help me now'))

        expect(result.correct).toBe(false)
        expect(result.errorFeedback).toBeUndefined()
    })

    it('a correct answer never carries error feedback', () => {
        expect(validateAnswer(translation, text('Could you help me?')).errorFeedback).toBeUndefined()
    })

    it('dictation is unaffected (no naturalness concept)', () => {
        const dictation: Exercise = { id: 'd', type: 'dictation', skill: 'listening', audioText: 'See you soon.', acceptedAnswers: ['See you soon.'] }

        expect(validateAnswer(dictation, text('see you soon')).naturalness).toBeUndefined()
    })
})

describe('contraction equivalence (Phase 10)', () => {
    const translation = (acceptedAnswers: string[]): Exercise => ({ id: 'c', type: 'translation', skill: 'vocabulary', source: 'دیر کردم', sourceLang: 'fa', acceptedAnswers })
    const answer = (exercise: Exercise, text: string) => validateAnswer(exercise, { kind: 'text', text }).correct

    it('accepts a contraction for its full form and the reverse', () => {
        expect(answer(translation(["I'm running late."]), 'I am running late')).toBe(true)
        expect(answer(translation(['I am running late.']), "I'm running late")).toBe(true)
        expect(answer(translation(["I don't know."]), 'I do not know')).toBe(true)
        expect(answer(translation(["I can't come."]), 'I cannot come')).toBe(true)
        expect(answer(translation(["I won't go."]), 'I will not go')).toBe(true)
        expect(answer(translation(["That's fine, we'll wait."]), 'That is fine, we will wait.')).toBe(true)
        expect(answer(translation(["Let's go."]), 'Let us go')).toBe(true)
    })

    it('handles curly apostrophes from phone keyboards', () => {
        expect(answer(translation(["I'm late."]), 'I’m late.')).toBe(true)
    })

    it('does not make different sentences equal', () => {
        expect(answer(translation(["I'm late."]), 'I am not late')).toBe(false)
        expect(answer(translation(["I can't come."]), 'I can come')).toBe(false)
    })

    it('leaves possessives alone', () => {
        expect(answer(translation(["Sara's bag is red."]), 'Sara is bag is red')).toBe(false)
        expect(answer(translation(["That's Sara's bag."]), "That is Sara's bag")).toBe(true)
    })

    it('dictation and grammar-correction stay literal', () => {
        const dictation: Exercise = { id: 'd', type: 'dictation', skill: 'listening', audioText: "I'm late.", acceptedAnswers: ["I'm late."] }
        const correction: Exercise = { id: 'g', type: 'grammar-correction', skill: 'grammar', incorrectSentence: 'He go home.', acceptedAnswers: ["He's going home."] }

        expect(answer(dictation, 'I am late')).toBe(false)
        expect(answer(correction, 'He is going home')).toBe(false)
    })
})
