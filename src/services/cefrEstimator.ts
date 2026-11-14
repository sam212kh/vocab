/**
 * Transparent CEFR level-ladder estimation (shared implementation in
 * ai-service/assessment/engine.mjs — see assessmentItemSelector.ts for
 * why). Deliberately NOT item-response theory: items are hand-levelled
 * and uncalibrated, so this is a documented heuristic, never a
 * psychometric claim. Confidence is capped at 0.8; insufficient evidence
 * yields level: null, never a guess.
 */
export {
    FAIL_ACCURACY,
    HOLD_ACCURACY,
    MAX_CONFIDENCE,
    MIN_CONFIDENCE,
    MIN_ITEMS_PER_LEVEL,
    MIN_TYPES_PER_LEVEL,
    estimateLevel,
} from '../../ai-service/assessment/engine.mjs'
