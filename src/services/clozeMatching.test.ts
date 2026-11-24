import { describe, expect, it } from 'vitest'
import { findClozeMatch, normalizeClozePhrase } from './clozeMatching'

describe('cloze phrase matching', () => {
    it('matches a phrase without matching a partial word', () => {
        expect(findClozeMatch('We need accurate measurements.', ['accurate'])?.text)
            .toBe('accurate')
        expect(findClozeMatch('The partial result is ready.', ['art'])).toBeNull()
    })

    it('matches multi-word, phrasal, hyphenated, and apostrophe phrases', () => {
        expect(findClozeMatch('She wrote the words down.', ['write sth down']))
            .toBeNull()
        expect(findClozeMatch('Please write down the new words.', ['write down'])?.text)
            .toBe('write down')
        expect(findClozeMatch('It is a state-of-the-art tool.', ['state-of-the-art'])?.text)
            .toBe('state-of-the-art')
        expect(findClozeMatch("What's the time?", ["What's the time?"])?.text)
            .toBe("What's the time?")
    })

    it('accepts harmless typography differences but preserves boundaries', () => {
        expect(normalizeClozePhrase('  state–of–the–art  ')).toBe('state-of-the-art')
        expect(findClozeMatch('A state–of–the–art lab opened.', ['state-of-the-art'])?.text)
            .toBe('state–of–the–art')
        expect(findClozeMatch('The go-between called.', ['go between'])).toBeNull()
    })

    it('supports explicitly configured inflection variants', () => {
        expect(findClozeMatch('The company ceased operations.', ['cease', 'ceased'])?.text)
            .toBe('ceased')
        expect(findClozeMatch('The company stopped operations.', ['cease', 'ceased']))
            .toBeNull()
    })
})
