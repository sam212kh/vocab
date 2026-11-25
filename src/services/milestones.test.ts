import { describe, expect, it } from 'vitest'

import { evaluateMilestones } from './milestones'

const input = (over: Partial<Parameters<typeof evaluateMilestones>[0]> = {}) => ({
    completedJourneyCount: 0,
    distinctIndependentlyKnownCount: 0,
    streakDays: 0,
    hasHadConversation: false,
    hasCompletedFirstRoadmapStage: false,
    ...over,
})

describe('evaluateMilestones', () => {
    it('earns nothing for a learner with no activity', () => {
        expect(evaluateMilestones(input())).toEqual([])
    })

    it('earns first-journey at exactly 1 completed journey', () => {
        expect(evaluateMilestones(input({ completedJourneyCount: 1 }))).toContain('first-journey')
    })

    it('does not earn fifty-expressions at 49', () => {
        expect(evaluateMilestones(input({ distinctIndependentlyKnownCount: 49 }))).not.toContain('fifty-expressions')
    })

    it('earns fifty-expressions at exactly 50', () => {
        expect(evaluateMilestones(input({ distinctIndependentlyKnownCount: 50 }))).toContain('fifty-expressions')
    })

    it('does not earn the streak milestone at 6 days', () => {
        expect(evaluateMilestones(input({ streakDays: 6 }))).not.toContain('seven-day-streak')
    })

    it('earns the streak milestone at 7 days', () => {
        expect(evaluateMilestones(input({ streakDays: 7 }))).toContain('seven-day-streak')
    })

    it('earns every milestone at once when all conditions hold', () => {
        const earned = evaluateMilestones(input({
            completedJourneyCount: 3,
            distinctIndependentlyKnownCount: 80,
            streakDays: 10,
            hasHadConversation: true,
            hasCompletedFirstRoadmapStage: true,
        }))

        expect(earned).toHaveLength(5)
    })
})
