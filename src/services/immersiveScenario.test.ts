import { describe, expect, it } from 'vitest'

import { nextDifficulty, scenarioComplete } from './immersiveScenario'

describe('immersive scenario engine', () => {
    it('adapts difficulty conservatively from repeated evidence', () => {
        expect(nextDifficulty(3, 0, 2)).toBe(2)
        expect(nextDifficulty(3, 3, 0)).toBe(4)
        expect(nextDifficulty(3, 1, 0)).toBe(3)
    })

    it('requires enough learner turns before completion', () => {
        expect(scenarioComplete(2, 3)).toBe(false)
        expect(scenarioComplete(3, 3)).toBe(true)
    })
})
