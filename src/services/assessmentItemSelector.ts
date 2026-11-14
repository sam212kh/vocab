/**
 * Deterministic adaptive item selection for assessments.
 *
 * The implementation lives in ai-service/assessment/engine.mjs — the
 * server runs it authoritatively (it owns the item banks and answer
 * keys); this module re-exports the SAME code with TypeScript typings so
 * the frontend (and vitest) use one implementation, not a port.
 *
 * Rules (see engine.mjs for the code):
 * - start at the self-reported level, B1 as documented fallback
 * - two consecutive correct at a level → step up; two wrong → step down
 * - item-type coverage via least-answered-type-first at the current level
 * - no repeats within a session; cross-session exposure avoided softly
 * - all ties broken by ascending item id (fully deterministic)
 * - terminates at the item budget or when the bank is exhausted
 */
export {
    CEFR_LADDER,
    DEFAULT_ITEM_BUDGET,
    DEFAULT_START_LEVEL,
    createSelectorState,
    recordAnswer,
    selectNextItem,
} from '../../ai-service/assessment/engine.mjs'

export type { SelectorRecord, SelectorState } from '../../ai-service/assessment/engine.mjs'
