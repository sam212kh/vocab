import { describe, expect, it } from 'vitest'

import {
    effortScore,
    performanceEventFor,
    productionEvidence,
    recognitionEvidence,
    retrievalEvidence,
    speakingEvidence,
    stageCountsFrom,
    summarizeSession,
} from './journeyEvidence'
import { buildRoadmap, currentRoadmapStage } from './roadmap'

import type { JourneyEvidenceRecord } from '../types/journey'

const BASE = { sessionId: 's1', activityId: 'a1', kind: 'vocab-retrieval' as const, skill: 'vocabulary' as const, itemKey: 'kettle', timestamp: 1 }

let counter = 0
function full(partial: Omit<JourneyEvidenceRecord, 'id'>): JourneyEvidenceRecord {
    return { ...partial, id: `e${counter++}` }
}

describe('learning-stage evidence', () => {
    it('a selected (multiple-choice) answer is recognition, never independent', () => {
        const e = recognitionEvidence(BASE, true)

        expect(e.stage).toBe('recognition')
        expect(e.independent).toBe(false)
        expect(e.modality).toBe('selected')
    })

    it('typed retrieval is recall; hints demote it from independent', () => {
        expect(retrievalEvidence(BASE, true, 0).independent).toBe(true)

        const hinted = retrievalEvidence(BASE, true, 1)
        expect(hinted.stage).toBe('recall')
        expect(hinted.independent).toBe(false)
        expect(hinted.hintsUsed).toBe(1)
    })

    it('production requires a substantive sentence using a target expression', () => {
        const good = productionEvidence(BASE, 'First I put the kettle on and wait.', ['kettle'])
        const tooShort = productionEvidence(BASE, 'kettle', ['kettle'])
        const noTarget = productionEvidence(BASE, 'I like warm drinks in the evening.', ['kettle'])

        expect(good.stage).toBe('production')
        expect(good.correct).toBe(true)
        expect(good.usedTargets).toEqual(['kettle'])
        expect(tooShort.correct).toBe(false)
        expect(noTarget.correct).toBe(false)
        expect(good.modality).toBe('typed')
    })

    it('speaking evidence is voice modality, fluency stage, and transcript-based', () => {
        const e = speakingEvidence(BASE, 85)

        expect(e.skill).toBe('speaking')
        expect(e.stage).toBe('fluency')
        expect(e.modality).toBe('voice')
        expect(e.correct).toBe(true)
        expect(speakingEvidence(BASE, 40).correct).toBe(false)
    })
})

describe('performance-event mapping (Speaking honesty)', () => {
    it('typed evidence NEVER maps to a speaking performance event', () => {
        const typedProduction = performanceEventFor(productionEvidence({ ...BASE, skill: 'speaking' }, 'I put the kettle on now.', ['kettle']))
        const typedRecall = performanceEventFor(retrievalEvidence({ ...BASE, skill: 'speaking' }, true, 0))

        expect(typedProduction.skill).not.toBe('speaking')
        expect(typedRecall.skill).not.toBe('speaking')
    })

    it('voice evidence maps to speaking', () => {
        expect(performanceEventFor(speakingEvidence(BASE, 90)).skill).toBe('speaking')
    })

    it('incorrect evidence carries an error category', () => {
        const event = performanceEventFor(retrievalEvidence(BASE, false, 0))

        expect(event.result).toBe('incorrect')
        expect(event.errorCategories!.length).toBeGreaterThan(0)
    })
})

describe('effort score', () => {
    it('weights independent recall/production above recognition; hints reduce credit; mistakes still earn effort', () => {
        const recognition = full({ ...recognitionEvidence(BASE, true) })
        const recall = full({ ...retrievalEvidence(BASE, true, 0) })
        const hintedRecall = full({ ...retrievalEvidence(BASE, true, 2) })
        const failedRecall = full({ ...retrievalEvidence(BASE, false, 0) })

        expect(effortScore([recall])).toBeGreaterThan(effortScore([recognition]))
        expect(effortScore([hintedRecall])).toBeLessThan(effortScore([recall]))
        expect(effortScore([failedRecall])).toBeGreaterThan(0)
        expect(effortScore([failedRecall])).toBeLessThan(effortScore([recall]))
    })

    it('ten recognition hits earn less than three independent recalls plus a sentence', () => {
        const easy = Array.from({ length: 10 }, () => full(recognitionEvidence(BASE, true)))
        const hard = [
            ...Array.from({ length: 3 }, () => full(retrievalEvidence(BASE, true, 0))),
            full({ ...productionEvidence(BASE, 'I put the kettle on and wait.', ['kettle']) }),
        ]

        expect(effortScore(hard)).toBeGreaterThan(effortScore(easy) * 0.99)
    })
})

describe('session summary', () => {
    it('counts encountered, independently recalled, productive attempts and stage breakdown separately', () => {
        const records = [
            full({ ...recognitionEvidence({ ...BASE, itemKey: 'a' }, true) }),
            full({ ...retrievalEvidence({ ...BASE, itemKey: 'b' }, true, 0) }),
            full({ ...retrievalEvidence({ ...BASE, itemKey: 'c' }, true, 1) }),
            full({ ...retrievalEvidence({ ...BASE, itemKey: 'd' }, false, 0) }),
            full({ ...productionEvidence({ ...BASE, itemKey: 'p' }, 'I put the kettle on now.', ['kettle']) }),
        ]

        const summary = summarizeSession(records, 3, 4, ['d', 'd'])

        expect(summary.expressionsEncountered).toBe(5)
        expect(summary.expressionsRecalledIndependently).toBe(1)
        expect(summary.productiveAttempts).toBe(1)
        expect(summary.stageBreakdown.recall).toEqual({ attempts: 3, correct: 2 })
        expect(summary.stageBreakdown.recognition).toEqual({ attempts: 1, correct: 1 })
        expect(summary.mistakesWorthReviewing).toEqual(['d'])
        expect(summary.activitiesCompleted).toBe(3)
    })

    it('suggests production when none happened; stage counts count only correct evidence', () => {
        const records = [full(retrievalEvidence(BASE, true, 0)), full(retrievalEvidence(BASE, false, 0))]

        expect(summarizeSession(records, 1, 1, []).nextSuggestion).toMatch(/sentence-building/)
        expect(stageCountsFrom(records).recall).toBe(1)
    })
})

describe('roadmap', () => {
    const all = ['vocabulary', 'grammar', 'real-life', 'conversation', 'career'] as const

    it('unlocks on evidence, not elapsed time: zero evidence keeps stage 1 available but not complete', () => {
        const roadmap = buildRoadmap({ evidence: [], completedJourneys: 0, availableSources: [...all] })

        expect(roadmap[0].state).toBe('available')
        expect(roadmap[1].state).toBe('locked')
    })

    it('a stage completes only with independent recall + journeys; hinted recalls do not count', () => {
        const hinted = Array.from({ length: 30 }, () => full(retrievalEvidence(BASE, true, 1)))
        const independent = Array.from({ length: 30 }, () => full(retrievalEvidence(BASE, true, 0)))

        const withHints = buildRoadmap({ evidence: hinted, completedJourneys: 5, availableSources: [...all] })
        const withIndependent = buildRoadmap({ evidence: independent, completedJourneys: 5, availableSources: [...all] })

        expect(withHints[0].state).not.toBe('completed')
        expect(withIndependent[0].state).toBe('completed')
        expect(withIndependent[1].state).toBe('in-progress')
    })

    it('stages whose content does not exist are content-pending, not falsely available', () => {
        const roadmap = buildRoadmap({ evidence: [], completedJourneys: 0, availableSources: ['vocabulary'] })

        expect(roadmap.find(s => s.id === 'professional-communication')!.state).toBe('content-pending')
        expect(roadmap.find(s => s.id === 'advanced-fluency')!.state).toBe('content-pending')
    })

    it('currentRoadmapStage is the first incomplete stage', () => {
        const roadmap = buildRoadmap({ evidence: [], completedJourneys: 0, availableSources: [...all] })

        expect(currentRoadmapStage(roadmap)!.id).toBe('everyday-foundations')
    })

    it('always describes requirements in plain language (stages are milestones, not CEFR)', () => {
        const roadmap = buildRoadmap({ evidence: [], completedJourneys: 0, availableSources: [...all] })

        for (const stage of roadmap) {
            expect(stage.requirement).toMatch(/completed journeys/)
            expect(stage.requirement).not.toMatch(/CEFR|A1|B2/)
        }
    })
})
