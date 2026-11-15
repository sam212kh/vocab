import { describe, expect, it } from 'vitest'

import { analyzeTextAnswer } from './answerDiff'
import { validateAnswer } from './exerciseEngine'

import type { TranslationExercise } from '../types/exercise'

/**
 * Regression suite for the reported defect: a translation answer with ONE
 * wrong word ("everyday day") was marked wholly incorrect with only an
 * unrelated topic explanation. Scoring stays binary (unchanged); the diff
 * layer must name the actual error and keep the learner's answer visible.
 */

/* The real bank item that triggered the report (grammar/present-simple-6). */
const EXERCISE: TranslationExercise = {
    id: 'present-simple-6',
    type: 'translation',
    skill: 'grammar',
    source: 'او هر روز انگلیسی مطالعه می‌کند.',
    sourceLang: 'fa',
    acceptedAnswers: [
        'She studies English every day.',
        'He studies English every day.',
    ],
    explanation: 'Third person singular: study → studies.',
}

describe('translation evaluation — reported reproduction', () => {
    it('case 1: the canonical answer is fully correct', () => {
        expect(validateAnswer(EXERCISE, { kind: 'text', text: 'She studies English every day.' }).correct).toBe(true)
    })

    it('case 2: "He studies..." is accepted — the Persian pronoun او is gender-neutral, so both subjects match the prompt', () => {
        expect(validateAnswer(EXERCISE, { kind: 'text', text: 'He studies English every day.' }).correct).toBe(true)

        /* And the analysis agrees: he is a valid accepted subject. */
        const analysis = analyzeTextAnswer(EXERCISE.acceptedAnswers, 'He studies English every day.')!
        expect(analysis.meaning).toBe('match')
    })

    it('case 2b: a subject NOT covered by any accepted variant is a meaning difference, reported separately', () => {
        const analysis = analyzeTextAnswer(EXERCISE.acceptedAnswers, 'They study English every day.')!

        expect(validateAnswer(EXERCISE, { kind: 'text', text: 'They study English every day.' }).correct).toBe(false)
        expect(analysis.meaning).toBe('subject-differs')
    })

    it('case 3: subject-verb agreement error is pinpointed to the single wrong word', () => {
        const answer = 'She study English every day.'

        expect(validateAnswer(EXERCISE, { kind: 'text', text: answer }).correct).toBe(false)

        const analysis = analyzeTextAnswer(EXERCISE.acceptedAnswers, answer)!

        expect(analysis.closestAccepted).toBe('She studies English every day.')
        expect(analysis.corrections).toEqual([
            { type: 'replace', learner: 'study', expected: 'studies' },
        ])
        expect(analysis.meaning).toBe('close')
    })

    it('case 4 (the reported bug): "everyday day" names the ACTUAL error, maps to the He-variant, meaning assessed as close', () => {
        const answer = 'He studies English everyday day'

        expect(validateAnswer(EXERCISE, { kind: 'text', text: answer }).correct).toBe(false)

        const analysis = analyzeTextAnswer(EXERCISE.acceptedAnswers, answer)!

        /* Compared against the He-variant, NOT the She-variant. */
        expect(analysis.closestAccepted).toBe('He studies English every day.')

        /* The only correction is everyday → every; "studies" is NOT flagged. */
        expect(analysis.corrections).toEqual([
            { type: 'replace', learner: 'everyday', expected: 'every' },
        ])
        expect(analysis.ops.filter(op => op.type === 'keep').map(op => (op as { text: string }).text))
            .toContain('studies')

        expect(analysis.meaning).toBe('close')
    })

    it('case 5: missing final punctuation is not a failure', () => {
        expect(validateAnswer(EXERCISE, { kind: 'text', text: 'She studies English every day' }).correct).toBe(true)
    })

    it('case 6: the learner answer is always preserved verbatim in the result', () => {
        const result = validateAnswer(EXERCISE, { kind: 'text', text: 'He studies English everyday day' })

        expect(result.received).toBe('He studies English everyday day')
        expect(result.expected).toBe('She studies English every day.')
        expect(result.received).not.toBe(result.expected)
    })
})

describe('analyzeTextAnswer mechanics', () => {
    it('reports missing and extra words distinctly', () => {
        const analysis = analyzeTextAnswer(['I have been to London'], 'I have to London often')!

        expect(analysis.corrections).toContainEqual({ type: 'missing', expected: 'been' })
        expect(analysis.corrections).toContainEqual({ type: 'extra', learner: 'often' })
    })

    it('a completely different sentence is assessed as different, not close', () => {
        const analysis = analyzeTextAnswer(['She studies English every day.'], 'The weather is nice today')!

        expect(analysis.meaning).toBe('different')
        expect(analysis.matchRatio).toBeLessThan(0.5)
    })

    it('case and punctuation differences produce no corrections', () => {
        const analysis = analyzeTextAnswer(['She studies English every day.'], 'she STUDIES english every day')!

        expect(analysis.corrections).toEqual([])
        expect(analysis.meaning).toBe('match')
    })

    it('returns null when there are no accepted answers', () => {
        expect(analyzeTextAnswer([], 'anything')).toBeNull()
    })
})
