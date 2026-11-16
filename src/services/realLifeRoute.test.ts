import { describe, expect, it } from 'vitest'

import { resolveRealLifeRoute } from './realLifeRoute'

const IDS = ['coffee-shop', 'doctor-visit', 'taxi']

describe('resolveRealLifeRoute', () => {
    it('valid scenario + valid step', () => {
        expect(resolveRealLifeRoute({ scenario: 'taxi', step: 'use' }, IDS)).toEqual({ scenarioId: 'taxi', step: 'use' })
    })

    it.each(['see', 'learn', 'practice', 'speak', 'use'])('accepts step "%s"', step => {
        expect(resolveRealLifeRoute({ scenario: 'taxi', step }, IDS)?.step).toBe(step)
    })

    it('valid scenario, missing step → opens at "see"', () => {
        expect(resolveRealLifeRoute({ scenario: 'taxi' }, IDS)).toEqual({ scenarioId: 'taxi', step: 'see' })
    })

    it.each(['done', 'bogus', '', 'USE', '../x'])('valid scenario, unsupported step "%s" → "see"', step => {
        expect(resolveRealLifeRoute({ scenario: 'taxi', step }, IDS)?.step).toBe('see')
    })

    it('unknown scenario id → null (home view), even with a valid step', () => {
        expect(resolveRealLifeRoute({ scenario: 'nope', step: 'use' }, IDS)).toBeNull()
    })

    it('missing scenario, or step without scenario → null', () => {
        expect(resolveRealLifeRoute({}, IDS)).toBeNull()
        expect(resolveRealLifeRoute({ step: 'use' }, IDS)).toBeNull()
        expect(resolveRealLifeRoute({ scenario: '' }, IDS)).toBeNull()
    })

    it('rejects injection-ish and prototype-ish ids', () => {
        for (const scenario of ['<script>', '../../etc/passwd', '__proto__', 'constructor', 'taxi/../x']) {
            expect(resolveRealLifeRoute({ scenario }, IDS)).toBeNull()
        }
    })

    it('handles repeated query params (array) by taking the first; ignores non-strings', () => {
        expect(resolveRealLifeRoute({ scenario: ['taxi', 'x'], step: ['speak'] }, IDS)).toEqual({ scenarioId: 'taxi', step: 'speak' })
        expect(resolveRealLifeRoute({ scenario: 5, step: {} }, IDS)).toBeNull()
        expect(resolveRealLifeRoute({ scenario: null }, IDS)).toBeNull()
    })

    it('empty manifest (still loading / failed) → null', () => {
        expect(resolveRealLifeRoute({ scenario: 'taxi' }, [])).toBeNull()
    })
})
