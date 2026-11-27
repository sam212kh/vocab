import { describe, expect, it } from 'vitest'

import { checkMeaningRecall, meaningRecallTarget, normalizePersianText } from './meaningRecall'

describe('normalizePersianText', () => {
    it('unifies Arabic and Persian letter variants', () => {
        expect(normalizePersianText('كافي')).toBe(normalizePersianText('کافی'))
    })

    it('treats a ZWNJ and a plain space as equivalent', () => {
        expect(normalizePersianText('می‌شود')).toBe(normalizePersianText('می شود'))
    })

    it('strips Arabic diacritics without touching the letters around them', () => {
        expect(normalizePersianText('كَافِي')).toBe(normalizePersianText('کافی'))
    })

    it('does not strip Persian digits (distinct unicode block from the stripped diacritics)', () => {
        expect(normalizePersianText('۳ مورد')).toBe('۳ مورد')
    })

    it('collapses punctuation and whitespace', () => {
        expect(normalizePersianText('کافی،  مناسب!')).toBe(normalizePersianText('کافی مناسب'))
    })
})

describe('meaningRecallTarget', () => {
    it('reports the real distinct meaning count, never a hardcoded number', () => {
        const target = meaningRecallTarget({
            meaning: 'کافی؛ مناسب',
            synonyms: [{ word: 'acceptable', meaning: 'قابل قبول' }],
        })

        expect(target.expectedCount).toBe(3)
        expect(target.accepted).toEqual(['کافی', 'مناسب', 'قابل قبول'])
    })

    it('reports 1 for a word with a single verified meaning', () => {
        const target = meaningRecallTarget({ meaning: 'به دست آوردن', synonyms: [] })

        expect(target.expectedCount).toBe(1)
    })

    it('never counts a duplicate synonym gloss as a second meaning', () => {
        const target = meaningRecallTarget({
            meaning: 'کافی',
            synonyms: [{ word: 'sufficient', meaning: 'کافی' }],
        })

        expect(target.expectedCount).toBe(1)
    })
})

describe('checkMeaningRecall', () => {
    const accepted = ['کافی', 'مناسب', 'قابل قبول']

    it('accepts all three meanings written in a different order than the data', () => {
        const result = checkMeaningRecall(['مناسب', 'قابل قبول', 'کافی'], accepted)

        expect(result.allCorrect).toBe(true)
        expect(result.matchedByInput).toEqual([true, true, true])
    })

    it('marks only the wrong box as unmatched, not the whole answer', () => {
        const result = checkMeaningRecall(['کافی', 'یک چیز اشتباه', 'قابل قبول'], accepted)

        expect(result.allCorrect).toBe(false)
        expect(result.matchedByInput).toEqual([true, false, true])
    })

    it('does not let one input double-claim the same accepted meaning for two boxes', () => {
        const result = checkMeaningRecall(['کافی', 'کافی', 'قابل قبول'], accepted)

        expect(result.matchedByInput).toEqual([true, false, true])
        expect(result.allCorrect).toBe(false)
    })

    it('treats an empty box as unmatched, never auto-correct', () => {
        const result = checkMeaningRecall(['کافی', '', 'قابل قبول'], accepted)

        expect(result.matchedByInput).toEqual([true, false, true])
        expect(result.allCorrect).toBe(false)
    })

    it('is correct for a single-meaning word with one input', () => {
        const result = checkMeaningRecall(['به دست آوردن'], ['به دست آوردن'])

        expect(result.allCorrect).toBe(true)
    })

    it('never invents acceptance for a plausible-sounding but unlisted paraphrase', () => {
        const result = checkMeaningRecall(['خوب'], accepted)

        expect(result.allCorrect).toBe(false)
        expect(result.matchedByInput).toEqual([false])
    })
})
