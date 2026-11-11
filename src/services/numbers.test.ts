import { describe, expect, it } from 'vitest'

import {
    annotateNumbers,
    englishWordsToNumber,
    normalizeNumbersInText,
    numberToEnglishWords,
    numberToPersianWords,
} from './numbers'
import { answersMatch } from './textMatch'
import { validateAnswer } from './exerciseEngine'

import type { DictationExercise, FillBlankExercise } from '../types/exercise'

describe('numberToEnglishWords', () => {
    it('converts the documented examples', () => {
        expect(numberToEnglishWords(7)).toBe('seven')
        expect(numberToEnglishWords(10)).toBe('ten')
        expect(numberToEnglishWords(21)).toBe('twenty-one')
        expect(numberToEnglishWords(100)).toBe('one hundred')
        expect(numberToEnglishWords(1000)).toBe('one thousand')
    })

    it('reads decimals digit by digit after "point"', () => {
        expect(numberToEnglishWords(25.5)).toBe('twenty-five point five')
        expect(numberToEnglishWords(3.14)).toBe('three point one four')
    })

    it('handles compound and large numbers', () => {
        expect(numberToEnglishWords(105)).toBe('one hundred five')
        expect(numberToEnglishWords(2500)).toBe('two thousand five hundred')
        expect(numberToEnglishWords(1000000)).toBe('one million')
    })
})

describe('numberToPersianWords', () => {
    it('converts common numbers', () => {
        expect(numberToPersianWords(10)).toBe('ده')
        expect(numberToPersianWords(21)).toBe('بیست و یک')
        expect(numberToPersianWords(100)).toBe('صد')
        expect(numberToPersianWords(1000)).toBe('یک هزار')
    })
})

describe('englishWordsToNumber', () => {
    it('parses cardinal phrases', () => {
        expect(englishWordsToNumber('seven')).toBe(7)
        expect(englishWordsToNumber('twenty-one')).toBe(21)
        expect(englishWordsToNumber('one hundred')).toBe(100)
        expect(englishWordsToNumber('one hundred and five')).toBe(105)
        expect(englishWordsToNumber('one thousand')).toBe(1000)
        expect(englishWordsToNumber('two thousand five hundred')).toBe(2500)
    })

    it('rejects non-cardinal phrases', () => {
        expect(englishWordsToNumber('hello')).toBeNull()
        expect(englishWordsToNumber('ten minutes')).toBeNull()
        expect(englishWordsToNumber('')).toBeNull()
    })
})

describe('normalizeNumbersInText', () => {
    it('makes digit and word forms identical inside sentences', () => {
        expect(normalizeNumbersInText('The bus leaves in ten minutes.'))
            .toBe(normalizeNumbersInText('The bus leaves in 10 minutes.'))
    })

    it('handles compound numbers in sentences', () => {
        expect(normalizeNumbersInText('She is twenty-one years old'))
            .toBe(normalizeNumbersInText('She is 21 years old'))
    })

    it('handles thousands separators', () => {
        expect(normalizeNumbersInText('It costs 1,000 dollars'))
            .toBe(normalizeNumbersInText('It costs one thousand dollars'))
    })

    it('handles decimals read as "point"', () => {
        expect(normalizeNumbersInText('The price is twenty-five point five zero'))
            .toBe(normalizeNumbersInText('The price is 25.50'))
    })

    it('never conflates different values', () => {
        expect(normalizeNumbersInText('in 10 minutes'))
            .not.toBe(normalizeNumbersInText('in 15 minutes'))

        expect(normalizeNumbersInText('in ten minutes'))
            .not.toBe(normalizeNumbersInText('in eleven minutes'))
    })

    it('does not merge year-style or digit-list readings into one cardinal', () => {
        /* "twenty twenty" (year 2020 reading) must not become 40 */
        expect(normalizeNumbersInText('twenty twenty')).toBe('20 20')
        expect(normalizeNumbersInText('one three')).toBe('1 3')
    })

    it('keeps "and" between separate numbers (lists) intact', () => {
        expect(normalizeNumbersInText('five and ten apples')).toBe('5 and 10 apples')
    })
})

describe('answersMatch with numberEquivalence', () => {
    it('accepts digit form for a word-form target and vice versa', () => {
        expect(answersMatch(
            'The bus leaves in ten minutes.',
            'The bus leaves in 10 minutes',
            { numberEquivalence: true }
        )).toBe(true)

        expect(answersMatch(
            'It costs 1,000 dollars.',
            'It costs one thousand dollars',
            { numberEquivalence: true }
        )).toBe(true)
    })

    it('still rejects different values', () => {
        expect(answersMatch(
            'The bus leaves in ten minutes.',
            'The bus leaves in 12 minutes',
            { numberEquivalence: true }
        )).toBe(false)
    })

    it('default behavior (no option) is unchanged', () => {
        expect(answersMatch('The bus leaves in ten minutes.', 'The bus leaves in 10 minutes')).toBe(false)
        expect(answersMatch('goes', 'goes')).toBe(true)
    })
})

describe('exercise engine number handling', () => {
    const dictation: DictationExercise = {
        id: 'dictation-numbers',
        type: 'dictation',
        skill: 'listening',
        audioText: 'The bus leaves in ten minutes.',
        acceptedAnswers: ['The bus leaves in ten minutes.'],
    }

    it('dictation accepts the digit form of a spoken number', () => {
        const result = validateAnswer(dictation, {
            kind: 'text',
            text: 'The bus leaves in 10 minutes.',
        })

        expect(result.correct).toBe(true)
    })

    it('dictation preserves the learner answer and the canonical expected answer verbatim', () => {
        const result = validateAnswer(dictation, {
            kind: 'text',
            text: 'The bus leaves in 10 minutes.',
        })

        expect(result.received).toBe('The bus leaves in 10 minutes.')
        expect(result.expected).toBe('The bus leaves in ten minutes.')
    })

    it('dictation still rejects a different numeric value', () => {
        const result = validateAnswer(dictation, {
            kind: 'text',
            text: 'The bus leaves in 2 minutes.',
        })

        expect(result.correct).toBe(false)
    })

    it('fill-blank stays strict (written form may be the thing being tested)', () => {
        const fillBlank: FillBlankExercise = {
            id: 'fb-number',
            type: 'fill-blank',
            skill: 'grammar',
            before: 'She has',
            after: 'cats. (write the number as a word)',
            acceptedAnswers: ['three'],
        }

        expect(validateAnswer(fillBlank, { kind: 'text', text: '3' }).correct).toBe(false)
        expect(validateAnswer(fillBlank, { kind: 'text', text: 'three' }).correct).toBe(true)
    })
})

describe('annotateNumbers', () => {
    it('annotates digit tokens with English and Persian forms', () => {
        const annotations = annotateNumbers('The bus leaves in 10 minutes.')

        expect(annotations).toHaveLength(1)
        expect(annotations[0]).toMatchObject({
            digits: '10',
            english: 'ten',
            persian: 'ده',
            reading: 'cardinal',
        })
    })

    it('annotates written cardinals too', () => {
        const annotations = annotateNumbers('She bought twenty-one apples.')

        expect(annotations).toHaveLength(1)
        expect(annotations[0].digits).toBe('21')
        expect(annotations[0].english).toBe('twenty-one')
        expect(annotations[0].persian).toBe('بیست و یک')
    })

    it('preserves original digit formatting and flags decimals', () => {
        const annotations = annotateNumbers('It costs 1,000 dollars and 25.50 euros.')

        expect(annotations.map(a => a.digits)).toEqual(['1,000', '25.50'])
        expect(annotations[1].reading).toBe('decimal')
    })

    it('returns nothing for sentences without numbers', () => {
        expect(annotateNumbers('She does not like spicy food.')).toEqual([])
    })
})
