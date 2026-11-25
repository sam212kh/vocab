import { describe, expect, it } from 'vitest'

import {
    buildLexicon,
    clampIndex,
    itemFromExpression,
    itemFromWord,
    parseWordIndex,
    tokenizeWithLexicon,
} from './learnItems'

import type { Word } from '../types/vocabulary'

const WORD: Word = {
    courseId: 'c', lessonId: 'l', word: 'achieve', meaning: 'به دست آوردن', level: 'B1', pos: 'verb',
    synonyms: [{ word: 'accomplish', meaning: '' }], examples: [{ english: 'She will achieve her goal.', persian: 'او به هدفش می‌رسد.' }],
    miniContext: 'To achieve more, plan.',
}

describe('adapters', () => {
    it('word → item keeps every field and invents nothing', () => {
        const item = itemFromWord(WORD)

        expect(item).toMatchObject({ id: 'achieve', text: 'achieve', meaning: WORD.meaning, pos: 'verb', level: 'B1', synonyms: [{ word: 'accomplish', meaning: '' }] })
        expect(item.examples).toEqual(WORD.examples)
        expect(item.usage).toBeUndefined()
        expect(item.mistakes).toEqual([])
    })

    it('empty pos/level/miniContext stay undefined (no empty chips)', () => {
        const item = itemFromWord({ ...WORD, pos: '', level: '', miniContext: '' })

        expect(item.pos).toBeUndefined()
        expect(item.level).toBeUndefined()
        expect(item.context).toBeUndefined()
    })

    it('expression → item uses the content note as the usage note, and its single example', () => {
        const item = itemFromExpression({ english: 'let it steep', persian: 'بگذار دم بکشد', example: 'Let it steep.', examplePersian: 'بگذار دم بکشد.', note: "'Steep' is correct." })

        expect(item.usage).toBe("'Steep' is correct.")
        expect(item.examples).toEqual([{ english: 'Let it steep.', persian: 'بگذار دم بکشد.' }])
    })

    it('expression without an example/note yields none', () => {
        const item = itemFromExpression({ english: 'x y', persian: 'p', example: '', examplePersian: '' })

        expect(item.examples).toEqual([])
        expect(item.usage).toBeUndefined()
    })
})

describe('tokenizeWithLexicon', () => {
    const items = [
        itemFromWord(WORD),
        itemFromWord({ ...WORD, word: 'put the kettle on', meaning: 'کتری گذاشتن' }),
        itemFromWord({ ...WORD, word: 'go', meaning: 'رفتن' }),
    ]
    const lexicon = buildLexicon(items)

    it('round-trips: tokens always rejoin to the exact input', () => {
        for (const text of ['She will achieve her goal.', 'I put the kettle on, then I achieved it!', 'nothing here', 'Achieve.', '']) {
            expect(tokenizeWithLexicon(text, lexicon).map(token => token.text).join('')).toBe(text)
        }
    })

    it('finds lesson words (whole word, case-insensitive, simple inflection) and keeps their original casing', () => {
        const tokens = tokenizeWithLexicon('Achieved goals matter. Then we put the kettle on.', lexicon)
        const hits = tokens.filter(token => token.entry).map(token => token.text)

        expect(hits).toEqual(['Achieved', 'put the kettle on'])
        expect(tokens.find(token => token.text === 'Achieved')?.entry?.itemIndex).toBe(0)
    })

    it('does not match inside other words and skips very short entries', () => {
        const tokens = tokenizeWithLexicon('Unachievable plans go nowhere.', lexicon)

        expect(tokens.some(token => token.entry)).toBe(false)
    })

    it('longest expression wins over a shorter one it contains', () => {
        const nested = buildLexicon([itemFromWord({ ...WORD, word: 'kettle' }), itemFromWord({ ...WORD, word: 'put the kettle on' })])
        const tokens = tokenizeWithLexicon('Please put the kettle on.', nested)

        expect(tokens.filter(token => token.entry).map(token => token.text)).toEqual(['put the kettle on'])
    })

    it('handles regex metacharacters in lesson words safely', () => {
        const odd = buildLexicon([itemFromWord({ ...WORD, word: '(dust)bin' }), itemFromWord({ ...WORD, word: 'a.b+c' })])

        expect(() => tokenizeWithLexicon('The (dust)bin and a.b+c.', odd)).not.toThrow()
    })

    it('empty lexicon → one plain token', () => {
        expect(tokenizeWithLexicon('Hello there', [])).toEqual([{ text: 'Hello there', entry: null }])
    })
})

describe('navigation helpers', () => {
    it('parseWordIndex: valid 1-based, invalid → first', () => {
        expect(parseWordIndex('3', 10)).toBe(2)
        expect(parseWordIndex('1', 10)).toBe(0)
        for (const bad of ['0', '11', '-1', 'abc', '', '1.5', '999999', undefined, null, 5, {}]) expect(parseWordIndex(bad, 10)).toBe(0)
        expect(parseWordIndex(['4', '9'], 10)).toBe(3)
    })

    it('clampIndex', () => {
        expect(clampIndex(-3, 5)).toBe(0)
        expect(clampIndex(9, 5)).toBe(4)
        expect(clampIndex(2, 5)).toBe(2)
        expect(clampIndex(2, 0)).toBe(0)
    })
})
