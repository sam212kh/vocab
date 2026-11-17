import { summarizeItem } from './evidenceEngine'
import { analyzeSkillGaps } from './skillGap'
import { buildRetentionReport } from './retention'
import { attemptsFromLedger, selectTransferTask } from './transfer'

import type { ItemEvidence, ItemSummary } from '../types/evidence'
import type { PerformanceEvent } from '../types/performance'
import type { PlannerEvidence } from '../types/journey'
import type { SkillGapReport } from '../types/skillGap'
import type { LearnedExpression, TransferPattern } from '../types/transfer'
import type { RetentionReport, SrsSnapshot } from './retention'

/**
 * One pure entry point that derives everything the planner and the progress
 * screen need from the SAME inputs, so they can never disagree.
 */
export interface IntelligenceInput {
    now: number
    items: ItemEvidence[]
    events: PerformanceEvent[]
    srs: SrsSnapshot[]
    patterns: TransferPattern[]
    /** Transfer contexts used in recent journeys (no-repeat). */
    recentContextIds?: string[]
}

export interface Intelligence {
    summaries: ItemSummary[]
    gaps: SkillGapReport
    retention: RetentionReport
    plannerEvidence: PlannerEvidence
}

const LEX = 'lex:'

export function computeIntelligence(input: IntelligenceInput): Intelligence {
    const { now, items } = input

    const summaries = items.map(item => summarizeItem(item, now))
    const gaps = analyzeSkillGaps({ now, items, events: input.events })
    const retention = buildRetentionReport(items, now, input.srs)

    const lexical = summaries.filter(summary => summary.key.startsWith(LEX))
    const text = (summary: ItemSummary) => summary.key.slice(LEX.length)

    const learned: LearnedExpression[] = lexical.map(summary => ({ key: summary.key, text: text(summary), stage: summary.stage }))

    const transfer = selectTransferTask({
        patterns: input.patterns,
        learned,
        history: attemptsFromLedger(items),
        recentContextIds: input.recentContextIds,
        now,
    })

    const plannerEvidence: PlannerEvidence = {
        introduced: lexical.map(text),
        stages: Object.fromEntries(lexical.map(summary => [text(summary), summary.stage])),
        retentionDue: retention.dueForRetentionCheck.filter(key => key.startsWith(LEX)).map(key => key.slice(LEX.length)),
        gaps: gaps.dimensions.map(dimension => ({ dimension: dimension.dimension, classification: dimension.classification, estimate: dimension.estimate, why: dimension.why })),
        transfer: {
            task: transfer.task
                ? { patternId: transfer.task.patternId, contextId: transfer.task.contextId, level: transfer.task.level, patternTitle: transfer.task.patternTitle, anchorExpression: transfer.task.anchorExpression, matches: [...transfer.task.matches], learn: transfer.task.learn, prompt: { ...transfer.task.prompt } }
                : null,
            reason: transfer.reason,
        },
    }

    return { summaries, gaps, retention, plannerEvidence }
}
