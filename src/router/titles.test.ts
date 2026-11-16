import { describe, expect, it } from 'vitest'

import routerSource from './index.ts?raw'
import { titleForRoute } from './titles'

describe('route titles', () => {
    it('every named route has a specific title', () => {
        const names = [...routerSource.matchAll(/name:\s*'([^']+)'/g)].map(match => match[1])

        expect(names.length).toBeGreaterThan(20)

        for (const name of names) {
            expect(titleForRoute(name), name).not.toBe('English Upgrade')
        }
    })

    it('unknown / missing names fall back to the app name', () => {
        expect(titleForRoute(undefined)).toBe('English Upgrade')
        expect(titleForRoute('nope')).toBe('English Upgrade')
        expect(titleForRoute(Symbol('x'))).toBe('English Upgrade')
    })

    it('formats as "Page · English Upgrade"', () => {
        expect(titleForRoute('quiz')).toBe('Quiz · English Upgrade')
    })
})
