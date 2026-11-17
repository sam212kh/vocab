import type { SkillName } from './skillProfile'

/**
 * Learning Evidence Engine — types.
 *
 * Evidence is recorded per ITEM (a word, an expression, a grammar topic, a
 * sentence pattern) as compact entries. Everything a learner "knows" is
 * DERIVED from those entries by pure functions (services/evidenceEngine.ts);
 * nothing here stores a mastery verdict.
 */

/** What the learner actually did (not what they know). */
export type EvidenceMode = 'view' | 'recognition' | 'recall' | 'production' | 'application'

/** The ladder, lowest to highest. 'retained' is added on top when delayed evidence exists. */
export type EvidenceStage = 'exposed' | 'recognized' | 'recalled' | 'produced' | 'applied'

export type DerivedStage = EvidenceStage | 'retained'

export const EVIDENCE_STAGES: EvidenceStage[] = ['exposed', 'recognized', 'recalled', 'produced', 'applied']

export type ItemKind = 'word' | 'expression' | 'grammar' | 'pattern' | 'exercise' | 'objective'

export interface EvidenceEntry {
    /** Timestamp (ms). */
    t: number
    mode: EvidenceMode
    /** null for a pure view. */
    ok: boolean | null
    /**
     * true only when the learner worked unaided: no hint, no shown correction,
     * no copied answer, no AI-written text. Assisted successes are recorded
     * but never count toward a stage or toward confidence.
     */
    independent: boolean
    /**
     * false when success was judged only by a shallow deterministic check
     * (length / keyword). Unverified successes never count toward a stage.
     */
    verified: boolean
    /** Where it happened: lesson id, scenario id, transfer-context id. Distinct contexts matter for production/application. */
    ctx?: string
    /** Skill the activity exercised, when known. */
    skill?: SkillName
    /** Sentence-evaluation outcome label for production entries (e.g. 'unnatural'). */
    q?: string
}

export interface ModeCounts {
    attempts: number
    independentSuccess: number
    assistedSuccess: number
    failures: number
}

export interface ItemEvidence {
    key: string
    kind: ItemKind
    firstSeenAt: number
    lastAt: number
    /** Lifetime totals — survive the entry cap, so counts stay honest. */
    counts: Record<EvidenceMode, ModeCounts>
    exposures: number
    /** Most recent entries, newest last (capped). */
    entries: EvidenceEntry[]
    /** Optional note for items migrated from legacy counters (not classified evidence). */
    legacy?: { correct: number; wrong: number }
}

export type EvidenceStrength = 'none' | 'insufficient' | 'emerging' | 'established'

export interface StageEvidence {
    satisfied: boolean
    /** Independent, verified successes that count toward this stage. */
    qualifyingSuccesses: number
    distinctDays: number
    distinctContexts: number
    /** What is still missing, in plain words (empty when satisfied). */
    missing: string[]
}

export interface ItemSummary {
    key: string
    kind: ItemKind
    /** Highest stage reached through an unbroken, contradiction-free ladder; null = nothing yet. */
    ladderStage: EvidenceStage | null
    /** ladderStage, upgraded to 'retained' when delayed independent evidence exists. */
    stage: DerivedStage | null
    stages: Record<EvidenceStage, StageEvidence>
    evidenceCount: number
    lastObservedAt: number | null
    firstSeenAt: number | null
    independentSuccesses: number
    assistedSuccesses: number
    unverifiedSuccesses: number
    /** 0..1, lower bound of a recency-weighted success estimate; 0 without independent evidence. */
    confidence: number
    strength: EvidenceStrength
    conflicting: boolean
    /** The ladder was lowered because recent independent attempts contradict it. */
    contradicted: boolean
    recent: { attempts: number; successes: number }
    historical: { attempts: number; successes: number }
    /** Longest gap (days) between the first independent recall-level success and a later independent success; null if none. */
    longestRetainedDays: number | null
    history: EvidenceEntry[]
}

export interface EvidenceInput {
    key: string
    kind: ItemKind
    mode: EvidenceMode
    ok: boolean | null
    independent?: boolean
    verified?: boolean
    ctx?: string
    skill?: SkillName
    q?: string
    at?: number
}
