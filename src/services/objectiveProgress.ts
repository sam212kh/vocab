import { normalizeKey, objectiveKey } from './evidenceBridge'

import type { ItemSummary } from '../types/evidence'
import type { ObjectiveIndexEntry } from '../types/objectives'

/**
 * Relates the evidence ledger to learning goals. PURE.
 *
 * An objective's evidence comes from two places: the exercises that name it
 * (recorded against `objective:<topic>#<id>`) and the expressions those exercises target
 * (recorded against `lex:`). Nothing here invents evidence: a goal with no ledger entries is
 * "not started", whatever the SRS says.
 */

export type GoalStatus = 'not-started' | 'started' | 'recognizes' | 'recalls' | 'uses'

const RANK: Record<string, number> = { exposed: 1, recognized: 2, recalled: 3, produced: 4, applied: 5 }
const rank = (stage: string | null | undefined) => (stage ? RANK[stage] ?? 0 : 0)

export interface GoalProgress {
    entry: ObjectiveIndexEntry
    status: GoalStatus
    /** Highest ladder stage reached by the objective's own exercises (null = none). */
    stage: string | null
    targets: { total: number; recognized: number; recalled: number; used: number }
    /** What to do next, or null when there is nothing useful to suggest. */
    next: { label: string; to: string } | null
}

export function routeFor(entry: ObjectiveIndexEntry, step: 'see' | 'practice' = 'see'): string {
    const slug = entry.topic.split('/')[1]

    switch (entry.area) {
        case 'real-life':
            return `/real-life?scenario=${slug}&step=${step}`
        case 'grammar':
            return '/grammar'
        case 'listening':
            return '/listening'
        default:
            return '/reading'
    }
}

export function goalProgress(index: ObjectiveIndexEntry[], summaries: ItemSummary[]): GoalProgress[] {
    const byKey = new Map(summaries.map(summary => [summary.key, summary]))

    return index.map(entry => {
        const own = byKey.get(`objective:${normalizeKey(objectiveKey(entry.topic, entry.id).slice('objective:'.length))}`)
        /* The ladder stage, not 'retained': retention says WHEN recall held, not that the learner can use the language. */
        const targetStages = entry.targets.map(target => byKey.get(`lex:${normalizeKey(target)}`)?.ladderStage ?? null)

        const targets = {
            total: entry.targets.length,
            recognized: targetStages.filter(stage => rank(stage) >= RANK.recognized).length,
            recalled: targetStages.filter(stage => rank(stage) >= RANK.recalled).length,
            used: targetStages.filter(stage => rank(stage) >= RANK.produced).length,
        }

        const best = Math.max(rank(own?.ladderStage), ...targetStages.map(rank))
        let status: GoalStatus = 'not-started'

        if (targets.used > 0) status = 'uses'
        else if (rank(own?.ladderStage) >= RANK.recalled || (targets.total > 0 && targets.recalled * 2 >= targets.total)) status = 'recalls'
        else if (best >= RANK.recognized) status = 'recognizes'
        else if (best >= RANK.exposed || (own?.evidenceCount ?? 0) > 0) status = 'started'

        const typedAvailable = entry.exercises.recall + entry.exercises.sentence > 0
        let next: GoalProgress['next'] = null

        if (status === 'not-started' || status === 'started') next = { label: 'Learn this goal', to: routeFor(entry, 'see') }
        else if (status === 'recognizes' && typedAvailable) next = { label: 'Practise typing it', to: routeFor(entry, 'practice') }
        else if (status === 'recalls') next = { label: 'Use it in a Daily Journey', to: '/daily-journey' }

        return { entry, status, stage: own?.ladderStage ?? null, targets, next }
    })
}

export interface GoalsSummary {
    total: number
    started: number
    recognizes: number
    recalls: number
    uses: number
}

export function goalsSummary(goals: GoalProgress[]): GoalsSummary {
    const count = (status: GoalStatus) => goals.filter(goal => goal.status === status).length

    return { total: goals.length, started: goals.filter(goal => goal.status !== 'not-started').length, recognizes: count('recognizes'), recalls: count('recalls'), uses: count('uses') }
}
