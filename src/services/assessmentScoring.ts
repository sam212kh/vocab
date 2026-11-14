/**
 * Assessment scoring, split by trust boundary:
 *
 * - ANSWER CHECKING happens only on the server
 *   (ai-service/assessment/scoring.mjs) — canonical answers never reach
 *   the browser, so there is nothing here that could check an answer.
 * - EVIDENCE AGGREGATION (building per-level evidence from the server's
 *   correct/incorrect verdicts) is pure and shared — re-exported from the
 *   single engine implementation.
 */
export { aggregateEvidence } from '../../ai-service/assessment/engine.mjs'

import type { AdministeredItemRecord } from '../types/assessment'
import type { SelectorRecord } from '../../ai-service/assessment/engine.mjs'

/** Adapt client-side administered records to the engine's record shape. */
export function toSelectorRecords(
    administered: AdministeredItemRecord[]
): SelectorRecord[] {
    return administered.map(record => ({
        itemId: record.itemId,
        level: record.level,
        itemType: record.itemType,
        correct: record.correct,
    }))
}
