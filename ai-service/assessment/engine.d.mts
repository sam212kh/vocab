import type { CefrLevel } from '../../src/types/cefr'
import type {
    AdministeredItemRecord,
    AssessmentItem,
    AssessmentLevelEvidence,
    SkillEstimateResult,
} from '../../src/types/assessment'

export declare const CEFR_LADDER: CefrLevel[]
export declare const DEFAULT_START_LEVEL: CefrLevel
export declare const DEFAULT_ITEM_BUDGET: number
export declare const MIN_ITEMS_PER_LEVEL: number
export declare const MIN_TYPES_PER_LEVEL: number
export declare const HOLD_ACCURACY: number
export declare const FAIL_ACCURACY: number
export declare const MAX_CONFIDENCE: number
export declare const MIN_CONFIDENCE: number

export interface SelectorRecord {
    itemId: string
    level: CefrLevel
    itemType: string
    correct: boolean
}

export interface SelectorState {
    currentLevel: CefrLevel
    streakCorrect: number
    streakWrong: number
    administeredIds: string[]
    records: SelectorRecord[]
    budget: number
    recentExposure: string[]
}

export declare function createSelectorState(
    selfReportedLevel?: CefrLevel | null,
    budget?: number,
    recentExposure?: string[]
): SelectorState

export declare function recordAnswer(
    state: SelectorState,
    item: Pick<AssessmentItem, 'id' | 'cefrLevel' | 'type'>,
    correct: boolean
): SelectorState

export declare function selectNextItem(
    state: SelectorState,
    bank: AssessmentItem[]
): AssessmentItem | null

/** Input records only need level/type/correct; itemType is any string
 * (bank loading constrains real data to ExerciseType). */
export interface EvidenceRecord {
    level: CefrLevel
    itemType: string
    correct: boolean
}

export declare function aggregateEvidence(
    records: EvidenceRecord[]
): AssessmentLevelEvidence[]

export declare function estimateLevel(
    records: EvidenceRecord[]
): Omit<SkillEstimateResult, 'skill'>
