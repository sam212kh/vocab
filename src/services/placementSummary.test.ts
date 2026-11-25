import { describe, expect, it } from 'vitest'

import { describeEstimate } from './placementSummary'
import type { SkillEstimateResult } from '../types/assessment'

const result = (over: Partial<SkillEstimateResult> = {}): SkillEstimateResult => ({
    skill: 'vocabulary',
    level: 'B1',
    confidence: 0.6,
    evidenceQuality: 'good',
    evidence: [],
    notes: [],
    ...over,
})

describe('describeEstimate', () => {
    it('surfaces levels that held as strengths, ordered highest first', () => {
        const { strengths } = describeEstimate(result({
            evidence: [
                { level: 'A1', asked: 6, correct: 6, accuracy: 1, itemTypes: ['multiple-choice', 'fill-blank'], sufficient: true, verdict: 'held' },
                { level: 'B1', asked: 6, correct: 5, accuracy: 0.83, itemTypes: ['multiple-choice', 'fill-blank'], sufficient: true, verdict: 'held' },
            ],
        }))

        expect(strengths[0]).toContain('B1')
    })

    it('surfaces failed/borderline levels as weaknesses, ordered lowest first', () => {
        const { weaknesses } = describeEstimate(result({
            evidence: [
                { level: 'B2', asked: 6, correct: 2, accuracy: 0.33, itemTypes: ['multiple-choice', 'fill-blank'], sufficient: true, verdict: 'failed' },
                { level: 'A2', asked: 6, correct: 3, accuracy: 0.5, itemTypes: ['multiple-choice', 'fill-blank'], sufficient: true, verdict: 'borderline' },
            ],
        }))

        expect(weaknesses[0]).toContain('A2')
    })

    it('never returns an empty strengths list when a level was reached', () => {
        const { strengths } = describeEstimate(result({ level: 'A2', evidence: [] }))

        expect(strengths.length).toBeGreaterThan(0)
    })

    it('flags low evidence quality as a weakness when nothing failed outright', () => {
        const { weaknesses } = describeEstimate(result({ evidenceQuality: 'low', evidence: [] }))

        expect(weaknesses.length).toBeGreaterThan(0)
    })

    it('caps strengths and weaknesses at 2 each', () => {
        const manyHeld: SkillEstimateResult['evidence'] = ['A1', 'A2', 'B1', 'B2'].map(level => ({
            level: level as SkillEstimateResult['evidence'][number]['level'],
            asked: 6, correct: 6, accuracy: 1, itemTypes: ['multiple-choice', 'fill-blank'], sufficient: true, verdict: 'held',
        }))

        const { strengths } = describeEstimate(result({ evidence: manyHeld }))

        expect(strengths.length).toBeLessThanOrEqual(2)
    })
})
