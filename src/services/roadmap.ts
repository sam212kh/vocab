import type {
    JourneyEvidenceRecord,
    LearningStage,
    RoadmapStageId,
    RoadmapStageStatus,
} from '../types/journey'

/**
 * Learning roadmap: thematic milestones, NOT certified CEFR levels.
 *
 * Unlock rule: a stage advances on DEMONSTRATED EVIDENCE (independent
 * recall + production + completed journeys), never elapsed days — and a
 * stage whose content does not exist yet is reported as 'content-pending'
 * instead of pretending the learner can progress through it. Nothing here
 * blocks access to any module; the roadmap only describes progress.
 */

interface StageDef {
    id: RoadmapStageId
    title: string
    description: string
    /** Content sources this stage depends on (all must be available). */
    needs: ContentSource[]
    /** Evidence thresholds to COMPLETE the stage. */
    thresholds: { recall: number; production: number; journeys: number; fluency: number }
}

export type ContentSource =
    | 'vocabulary'
    | 'grammar'
    | 'real-life'
    | 'conversation'
    | 'career'
    | 'advanced-content'

export const ROADMAP: StageDef[] = [
    { id: 'everyday-foundations', title: 'Everyday Foundations', description: 'Core words and phrases for daily objects and actions.', needs: ['vocabulary'], thresholds: { recall: 25, production: 0, journeys: 3, fluency: 0 } },
    { id: 'daily-communication', title: 'Daily Communication', description: 'Describe your daily life in simple, correct sentences.', needs: ['vocabulary', 'real-life'], thresholds: { recall: 40, production: 8, journeys: 6, fluency: 0 } },
    { id: 'natural-conversations', title: 'Natural Conversations', description: 'Hold short everyday conversations with natural phrasing.', needs: ['real-life', 'conversation'], thresholds: { recall: 60, production: 16, journeys: 10, fluency: 5 } },
    { id: 'social-english', title: 'Social English', description: 'Small talk, opinions, plans and social situations.', needs: ['real-life', 'conversation'], thresholds: { recall: 80, production: 24, journeys: 15, fluency: 10 } },
    { id: 'professional-communication', title: 'Professional Communication', description: 'Meetings, updates, emails and workplace English.', needs: ['career'], thresholds: { recall: 100, production: 32, journeys: 20, fluency: 15 } },
    { id: 'career-interviews', title: 'Career & Interviews', description: 'Interview answers, negotiation, professional storytelling.', needs: ['career', 'conversation'], thresholds: { recall: 120, production: 40, journeys: 25, fluency: 20 } },
    { id: 'advanced-fluency', title: 'Advanced Fluency', description: 'Nuance, argumentation and effortless extended speech.', needs: ['advanced-content'], thresholds: { recall: 160, production: 60, journeys: 35, fluency: 30 } },
]

export interface RoadmapInput {
    evidence: JourneyEvidenceRecord[]
    completedJourneys: number
    availableSources: ContentSource[]
}

function counts(evidence: JourneyEvidenceRecord[]) {
    const byStage: Record<LearningStage, number> = { recognition: 0, recall: 0, production: 0, fluency: 0 }

    for (const record of evidence) {
        if (!record.correct) continue

        /* Recall only counts when independent (no hints) — recognizing a
         * word is not the same as retrieving it. */
        if (record.stage === 'recall' && !record.independent) continue

        byStage[record.stage]++
    }

    return byStage
}

export function buildRoadmap(input: RoadmapInput): RoadmapStageStatus[] {
    const stats = counts(input.evidence)
    const available = new Set(input.availableSources)

    const result: RoadmapStageStatus[] = []

    let previousCompleted = true

    for (const stage of ROADMAP) {
        const contentReady = stage.needs.every(source => available.has(source))
        const t = stage.thresholds

        const ratios = [
            t.recall ? stats.recall / t.recall : 1,
            t.production ? stats.production / t.production : 1,
            t.journeys ? input.completedJourneys / t.journeys : 1,
            t.fluency ? stats.fluency / t.fluency : 1,
        ].map(ratio => Math.min(1, ratio))

        const progress = Number((ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length).toFixed(2))
        const evidenceComplete = ratios.every(ratio => ratio >= 1)

        /* "In progress" must reflect REAL evidence — stages whose
         * thresholds are zero for some dimensions would otherwise read as
         * started with no activity at all. */
        const hasRealEvidence =
            stats.recall + stats.production + stats.fluency > 0 || input.completedJourneys > 0

        const requirement = [
            t.recall ? `${t.recall} independent recalls` : '',
            t.production ? `${t.production} sentences you built` : '',
            t.fluency ? `${t.fluency} spoken attempts` : '',
            `${t.journeys} completed journeys`,
        ].filter(Boolean).join(' · ')

        let state: RoadmapStageStatus['state']

        if (!contentReady) state = 'content-pending'
        else if (!previousCompleted) state = 'locked'
        else if (evidenceComplete) state = 'completed'
        else if (hasRealEvidence && progress > 0) state = 'in-progress'
        else state = 'available'

        result.push({
            id: stage.id,
            title: stage.title,
            description: stage.description,
            state,
            progress,
            requirement,
        })

        /* A content-pending stage does not block the roadmap view for later
         * stages from being described, but progression past it requires it. */
        previousCompleted = state === 'completed'
    }

    return result
}

/** The learner's current stage: first one not completed. */
export function currentRoadmapStage(roadmap: RoadmapStageStatus[]): RoadmapStageStatus | null {
    return roadmap.find(stage => stage.state !== 'completed') ?? null
}
