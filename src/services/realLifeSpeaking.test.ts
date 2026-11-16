import { describe, expect, it } from 'vitest'

import { checkPronunciation, SPEAKING_PASS_SCORE } from './pronunciation'
import { evaluateRealLifeSpeaking } from './realLifeSpeaking'

/* Same-length strings with N substitutions → score = round((1 - N/len) * 100). */
function withSubstitutions(base: string, count: number): string {
    return base
        .split('')
        .map((char, index) => (index < count ? (char === 'z' ? 'y' : 'z') : char))
        .join('')
}

const BASE_19 = 'abcdefghijklmnopqrs' // 4 subs → 79
const BASE_10 = 'abcdefghij' //          2 subs → 80
const BASE_21 = 'abcdefghijklmnopqrstu' // 4 subs → 81

describe('evaluateRealLifeSpeaking threshold (shared with Guided Speaking)', () => {
    it('uses the shared 80 threshold constant', () => {
        expect(SPEAKING_PASS_SCORE).toBe(80)
        expect(checkPronunciation(BASE_10, withSubstitutions(BASE_10, 2)).correct).toBe(true)
    })

    it('score below threshold (79) → incorrect', () => {
        const outcome = evaluateRealLifeSpeaking('s1', [BASE_19], withSubstitutions(BASE_19, 4), 0.9)

        expect(outcome.score).toBe(79)
        expect(outcome.event?.result).toBe('incorrect')
    })

    it('score exactly at threshold (80) → correct', () => {
        const outcome = evaluateRealLifeSpeaking('s1', [BASE_10], withSubstitutions(BASE_10, 2), 0.9)

        expect(outcome.score).toBe(80)
        expect(outcome.event?.result).toBe('correct')
    })

    it('score above threshold (81 and 100) → correct', () => {
        const eightyOne = evaluateRealLifeSpeaking('s1', [BASE_21], withSubstitutions(BASE_21, 4), null)
        const perfect = evaluateRealLifeSpeaking('s1', ['Hello there'], 'hello there!', null)

        expect(eightyOne.score).toBe(81)
        expect(eightyOne.event?.result).toBe('correct')
        expect(perfect.score).toBe(100)
        expect(perfect.event?.result).toBe('correct')
    })

    it('a clearly wrong transcript is incorrect, not silently correct', () => {
        const outcome = evaluateRealLifeSpeaking('s1', ['Could I have a coffee please'], 'banana', 0.99)

        expect(outcome.event?.result).toBe('incorrect')
    })

    it('scores against the BEST model sentence', () => {
        const outcome = evaluateRealLifeSpeaking('s1', ['totally different words', 'see you tomorrow'], 'see you tomorrow', null)

        expect(outcome.closest).toBe('see you tomorrow')
        expect(outcome.event?.result).toBe('correct')
    })
})

describe('evaluateRealLifeSpeaking evidence honesty', () => {
    it('empty / whitespace transcript (no voice input) creates NO speaking evidence', () => {
        expect(evaluateRealLifeSpeaking('s1', ['hello'], '', null).event).toBeNull()
        expect(evaluateRealLifeSpeaking('s1', ['hello'], '   ', 0.9).event).toBeNull()
    })

    it('event is always skill=speaking and tagged to the scenario', () => {
        const event = evaluateRealLifeSpeaking('cafe', ['hello'], 'hello', 0.7).event

        expect(event).toMatchObject({ skill: 'speaking', activityId: 'real-life-cafe', lessonId: 'cafe', confidence: 0.7 })
    })

    it('recognizer confidence 0 is stored as null (not applicable), never as a score', () => {
        expect(evaluateRealLifeSpeaking('s1', ['hello'], 'hello', 0).event?.confidence).toBeNull()
    })
})
