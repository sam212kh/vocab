import { describe, expect, it } from 'vitest'

import { modeForPath } from './modes'

describe('modeForPath', () => {
    it.each([
        ['/', 'overview'], ['/daily-journey', 'overview'], ['/skills', 'overview'], ['/progress', 'overview'], ['/profile', 'overview'], ['/ai-settings', 'overview'],
        ['/lessons', 'learn'], ['/courses/upgrade', 'learn'], ['/courses/upgrade/lessons/batch-01', 'learn'], ['/real-life', 'learn'],
        ['/practice', 'practice'], ['/quiz', 'practice'], ['/cloze', 'practice'], ['/matching', 'practice'], ['/listening', 'practice'],
        ['/grammar', 'practice'], ['/reading', 'practice'], ['/conversation', 'practice'], ['/session', 'practice'], ['/writing', 'practice'],
        ['/career-english', 'career'],
        ['/onboarding', 'overview'], ['/placement', 'practice'], ['/learning-path', 'learn'],
    ])('%s → %s', (path, mode) => {
        expect(modeForPath(path)).toBe(mode)
    })

    it('does not match on shared prefixes (/practice-x is not /practice)', () => {
        expect(modeForPath('/practice-extra')).toBe('overview')
        expect(modeForPath('/lessonsX')).toBe('overview')
    })

    it('unknown paths fall back to overview', () => {
        expect(modeForPath('/nope')).toBe('overview')
    })
})
