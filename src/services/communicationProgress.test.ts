import { describe, expect, it } from 'vitest'

import { COMMUNICATION_METRICS } from './communicationProgress'

describe('communication progress definitions', () => {
    it('maps dashboard indicators to existing evidence dimensions', () => {
        expect(COMMUNICATION_METRICS).toHaveLength(6)
        expect(new Set(COMMUNICATION_METRICS.map(item => item.id)).size).toBe(6)
        expect(COMMUNICATION_METRICS.every(item => item.labelPersian && item.note && item.notePersian)).toBe(true)
    })

    it('does not introduce an unsupported proficiency score', () => {
        expect(COMMUNICATION_METRICS.some(item => item.note.includes('does not infer'))).toBe(true)
    })
})
