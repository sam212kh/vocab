import type { CefrLevel } from './cefr'
import type { Exercise, ExerciseType } from './exercise'
import type { SkillName } from './skillProfile'

/**
 * Assessment domain types. The authoritative item banks (with canonical
 * answers) live ONLY on the server (ai-service/assessment/banks); the
 * client sees sanitized items and correct/incorrect verdicts, never keys.
 */

export type AssessmentSkill = SkillName

export type AssessmentSessionKind = 'placement' | 'skill-check'

/**
 * A full assessment item as stored SERVER-SIDE: the existing exercise
 * union plus assessment metadata. Exactly ONE CEFR level per item (ranges
 * are not allowed in banks — adaptive selection needs a single rung).
 */
export type AssessmentItem = Exercise & {
    cefrLevel: CefrLevel
    /** 1-5 within its level; used only as a tiebreaker/report detail. */
    difficulty?: number
}

/**
 * What the client is allowed to see: everything needed to RENDER the item,
 * nothing that reveals the answer. Choice options are included (they are
 * part of the question); correctIndex/acceptedAnswers/segment order are
 * stripped or shuffled server-side.
 */
export interface SanitizedAssessmentItem {
    id: string
    type: ExerciseType
    skill: AssessmentSkill
    cefrLevel: CefrLevel
    prompt?: string
    before?: string
    after?: string
    options?: string[]
    /** Shuffled by the server; submit the displayed order. */
    segments?: string[]
    pairsLeft?: string[]
    /** Shuffled by the server. */
    pairsRight?: string[]
    audioText?: string
    source?: string
    incorrectSentence?: string
    hint?: string
}

/** What the learner submits for one item. */
export type AssessmentAnswer =
    | { kind: 'choice'; index: number }
    | { kind: 'text'; text: string }
    | { kind: 'ordering'; order: number[] }
    | { kind: 'matching'; matches: { leftIndex: number; rightIndex: number }[] }

/** Minimal per-item record kept client-side and used for estimation. */
export interface AdministeredItemRecord {
    itemId: string
    level: CefrLevel
    itemType: ExerciseType
    correct: boolean
    timeSpentMs: number | null
}

/** Per-level evidence aggregated from administered records. */
export interface AssessmentLevelEvidence {
    level: CefrLevel
    asked: number
    correct: number
    accuracy: number
    itemTypes: ExerciseType[]
    /** asked >= 6 AND >= 2 distinct item types. */
    sufficient: boolean
    verdict: 'held' | 'failed' | 'borderline' | 'untested' | 'under-sampled'
}

export type EvidenceQuality = 'insufficient' | 'low' | 'moderate' | 'good'

/**
 * An internal estimate — explicitly NOT a certified CEFR result. `level`
 * is null when the evidence does not support any level ("insufficient
 * evidence" is a first-class outcome, never replaced by a guess).
 */
export interface SkillEstimateResult {
    skill: AssessmentSkill
    level: CefrLevel | null
    /** 0.2–0.8; internal estimates never exceed 0.8 by design. */
    confidence: number
    evidenceQuality: EvidenceQuality
    evidence: AssessmentLevelEvidence[]
    /** Human-readable caveats (boundary cases, untested ceilings, ...). */
    notes: string[]
}

export type AssessmentSessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'

/**
 * Client-side session record. The SERVER is authoritative for the active
 * state (pending item, canonical answers); this mirror stores only what
 * the UI and history need.
 */
export interface AssessmentSession {
    /** Server-issued session id. */
    id: string
    kind: AssessmentSessionKind
    skill: AssessmentSkill
    status: AssessmentSessionStatus
    startedAt: number
    completedAt: number | null
    administered: AdministeredItemRecord[]
    result: SkillEstimateResult | null
}

/* ---------- API contracts (mirrored by ai-service/assessment) ---------- */

export interface StartAssessmentRequest {
    skill: AssessmentSkill
    kind: AssessmentSessionKind
    selfReportedLevel?: CefrLevel | null
}

export interface AssessmentProgress {
    answered: number
    budget: number
    done: boolean
}

export interface StartAssessmentResponse {
    sessionId: string
    item: SanitizedAssessmentItem | null
    progress: AssessmentProgress
}

export interface SubmitAnswerResponse {
    correct: boolean
    item: SanitizedAssessmentItem | null
    progress: AssessmentProgress
}

export interface AssessmentResultResponse {
    sessionId: string
    skill: AssessmentSkill
    kind: AssessmentSessionKind
    startedAt: number
    completedAt: number
    administered: AdministeredItemRecord[]
    result: SkillEstimateResult
}
