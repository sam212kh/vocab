import { describe, expect, it } from 'vitest'

import { getMeanings, glossedSynonyms, pickReviewPrompt, primaryMeaning, splitPrimarySenses } from './vocabularyMeanings'
import type { Word } from '../types/vocabulary'

const word = (over: Partial<Word> = {}): Word => ({
    courseId: 'upgrade',
    lessonId: 'batch-01',
    word: 'obtain',
    meaning: 'به دست آوردن',
    level: 'Intermediate',
    pos: 'verb',
    synonyms: [],
    examples: [],
    miniContext: '',
    ...over,
})

describe('splitPrimarySenses', () => {
    it('returns a single sense for a plain meaning', () => {
        expect(splitPrimarySenses('به دست آوردن')).toEqual(['به دست آوردن'])
    })

    it('splits on the Persian semicolon used in authored multi-sense entries', () => {
        expect(splitPrimarySenses('به دست آوردن؛ موفق شدن')).toEqual(['به دست آوردن', 'موفق شدن'])
    })

    it('splits on an ASCII semicolon too', () => {
        expect(splitPrimarySenses('کافی; مناسب')).toEqual(['کافی', 'مناسب'])
    })

    it('dedupes case-insensitively and drops empty segments', () => {
        expect(splitPrimarySenses('کافی؛ کافی؛ ؛مناسب')).toEqual(['کافی', 'مناسب'])
    })
})

describe('getMeanings — a word with three meanings displays all three', () => {
    it('combines every distinct primary sense and synonym gloss without an arbitrary cap', () => {
        const entries = getMeanings(word({
            meaning: 'به دست آوردن؛ کسب کردن',
            synonyms: [{ word: 'get', meaning: 'گرفتن' }, { word: 'acquire', meaning: 'تحصیل کردن' }],
        }))

        expect(entries.map(entry => entry.text)).toEqual(['به دست آوردن', 'کسب کردن', 'گرفتن', 'تحصیل کردن'])
        expect(entries).toHaveLength(4)
    })
})

describe('getMeanings — a word with two meanings displays both', () => {
    it('one primary sense plus one synonym gloss', () => {
        const entries = getMeanings(word({
            meaning: 'به دست آوردن',
            synonyms: [{ word: 'acquire', meaning: 'کسب کردن' }],
        }))

        expect(entries.map(entry => entry.text)).toEqual(['به دست آوردن', 'کسب کردن'])
    })
})

describe('getMeanings — a word with one verified meaning does not show fabricated meanings', () => {
    it('no synonyms at all → exactly one meaning, never padded', () => {
        const entries = getMeanings(word({ meaning: 'کافی', synonyms: [] }))

        expect(entries).toEqual([{ text: 'کافی', source: 'primary' }])
    })

    it('synonyms exist but carry no Persian gloss → still exactly one meaning', () => {
        const entries = getMeanings(word({ meaning: 'کافی', synonyms: [{ word: 'sufficient', meaning: '' }] }))

        expect(entries).toEqual([{ text: 'کافی', source: 'primary' }])
    })

    it('a synonym gloss identical to the primary sense is not duplicated', () => {
        const entries = getMeanings(word({ meaning: 'کافی', synonyms: [{ word: 'sufficient', meaning: 'کافی' }] }))

        expect(entries).toEqual([{ text: 'کافی', source: 'primary' }])
    })

    it('dedupes harmless Persian/Arabic keyboard variants without changing display text', () => {
        const entries = getMeanings(word({ meaning: 'کافی', synonyms: [{ word: 'enough', meaning: 'كافی' }] }))

        expect(entries).toEqual([{ text: 'کافی', source: 'primary' }])
    })
})

describe('primaryMeaning', () => {
    it('is the first sense of a multi-sense meaning', () => {
        expect(primaryMeaning(word({ meaning: 'دست یافتن به؛ به موفقیت رسیدن' }))).toBe('دست یافتن به')
    })
})

describe('pickReviewPrompt — contextual prompts disambiguate similar words', () => {
    it('exposes every verified meaning for the recall prompt', () => {
        const item = word({
            meaning: 'به دست آوردن؛ کسب کردن',
            synonyms: [{ word: 'get', meaning: 'گرفتن' }],
        })

        expect(pickReviewPrompt(item, [item]).meanings).toEqual(['به دست آوردن', 'کسب کردن', 'گرفتن'])
    })

    it('two words sharing the same primary meaning are both flagged ambiguous, with a real example as context', () => {
        const obtain = word({
            word: 'obtain',
            meaning: 'به دست آوردن',
            examples: [{ english: 'You must obtain written permission.', persian: 'باید اجازه کتبی به دست بیاورید.' }],
        })
        const achieve = word({
            word: 'achieve',
            meaning: 'به دست آوردن',
            examples: [{ english: 'You can achieve your goals.', persian: 'می‌توانی به اهدافت برسی.' }],
        })

        const pool = [obtain, achieve]

        const obtainPrompt = pickReviewPrompt(obtain, pool)
        expect(obtainPrompt.isAmbiguous).toBe(true)
        expect(obtainPrompt.meanings).toEqual(['به دست آوردن'])
        expect(obtainPrompt.contextExample).toEqual(obtain.examples[0])

        const achievePrompt = pickReviewPrompt(achieve, pool)
        expect(achievePrompt.isAmbiguous).toBe(true)
        expect(achievePrompt.meanings).toEqual(['به دست آوردن'])
        expect(achievePrompt.contextExample).toEqual(achieve.examples[0])
    })

    it('a word with a unique primary meaning is not flagged ambiguous and carries no context example', () => {
        const unique = word({ word: 'adequate', meaning: 'کافی' })
        const other = word({ word: 'obtain', meaning: 'به دست آوردن' })

        const prompt = pickReviewPrompt(unique, [unique, other])

        expect(prompt.isAmbiguous).toBe(false)
        expect(prompt.contextExample).toBeNull()
    })

    it('does not flag a word as ambiguous against itself in a single-word pool', () => {
        const only = word({ word: 'obtain', meaning: 'به دست آوردن' })

        expect(pickReviewPrompt(only, [only]).isAmbiguous).toBe(false)
    })

    it('never fabricates a context example when the ambiguous word has none', () => {
        const a = word({ word: 'obtain', meaning: 'به دست آوردن', examples: [] })
        const b = word({ word: 'achieve', meaning: 'به دست آوردن', examples: [] })

        expect(pickReviewPrompt(a, [a, b]).contextExample).toBeNull()
    })
})

describe('glossedSynonyms', () => {
    it('keeps only synonyms that have both an English word and a Persian gloss', () => {
        const result = glossedSynonyms([
            { word: 'acquire', meaning: 'کسب کردن' },
            { word: 'get', meaning: '' },
            { word: '', meaning: 'گرفتن' },
        ])

        expect(result).toEqual([{ word: 'acquire', meaning: 'کسب کردن' }])
    })
})
