/**
 * Milestones (Phase 11.6). Each is a pure yes/no derived from existing
 * evidence — nothing here tracks its own "did this happen" state. The
 * gamification store only remembers which ones have already been shown to
 * the learner, so a milestone that stays true doesn't re-celebrate itself
 * on every visit.
 */

export type MilestoneId =
    | 'first-journey'
    | 'fifty-expressions'
    | 'seven-day-streak'
    | 'first-conversation'
    | 'first-roadmap-stage'

export interface MilestoneDef {
    id: MilestoneId
    title: string
    description: string
}

export const MILESTONES: MilestoneDef[] = [
    { id: 'first-journey', title: 'First Lesson Completed', description: 'You finished your first Daily Journey.' },
    { id: 'fifty-expressions', title: 'First 50 Expressions Learned', description: 'You recalled or used 50 words/expressions on your own.' },
    { id: 'seven-day-streak', title: 'Seven Days of Consistent Learning', description: 'A full week of real learning activity, back to back.' },
    { id: 'first-conversation', title: 'First Independent Conversation', description: 'You had your first conversation practice.' },
    { id: 'first-roadmap-stage', title: 'First Completed Unit', description: 'You completed your first learning-path stage.' },
]

export interface MilestoneEvaluationInput {
    completedJourneyCount: number
    distinctIndependentlyKnownCount: number
    streakDays: number
    hasHadConversation: boolean
    hasCompletedFirstRoadmapStage: boolean
}

/** Returns the ids of every milestone that's currently true (already earned), regardless of whether it's been shown before. */
export function evaluateMilestones(input: MilestoneEvaluationInput): MilestoneId[] {
    const earned: MilestoneId[] = []

    if (input.completedJourneyCount >= 1) earned.push('first-journey')
    if (input.distinctIndependentlyKnownCount >= 50) earned.push('fifty-expressions')
    if (input.streakDays >= 7) earned.push('seven-day-streak')
    if (input.hasHadConversation) earned.push('first-conversation')
    if (input.hasCompletedFirstRoadmapStage) earned.push('first-roadmap-stage')

    return earned
}
