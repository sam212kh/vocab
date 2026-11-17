import { EVIDENCE_STAGES } from '../types/evidence'

import type {
    DerivedStage,
    EvidenceEntry,
    EvidenceMode,
    EvidenceStage,
    EvidenceStrength,
    ItemEvidence,
    ItemSummary,
    StageEvidence,
} from '../types/evidence'

/**
 * Learning Evidence Engine. PURE and deterministic: (entries, now) → summary.
 *
 * Principles (every one is enforced by tests):
 *  - Viewing is exposure, never knowledge.
 *  - Only INDEPENDENT, VERIFIED successes count toward a stage or confidence.
 *    Hint-assisted, AI-written/shown-correction, copied and shallow-checked
 *    answers are counted separately and ignored for progression.
 *  - One success never establishes anything: every stage has a minimum number
 *    of successes plus a diversity requirement.
 *  - The ladder is strict: a stage needs its own evidence AND every stage
 *    below it (higher-mode successes also count for lower stages).
 *  - Conflicting recent evidence lowers confidence; repeated recent failure
 *    lowers the stage.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Stage criteria, with the reasoning for each number.
 *
 *  recognized  weighted ≥ 3 — a 4-option choice is guessable (25%): three correct
 *              by luck is 1.6%. A typed/produced success is effectively
 *              unguessable, so it weighs 2 (two of those suffice).
 *  recalled    ≥ 2 independent unaided successes on ≥ 2 different days —
 *              retrieval right after seeing the item is largely working
 *              memory; a second day shows it was stored.
 *  produced    ≥ 2 independent production/application successes with ≥ 2
 *              different prompts — one correct sentence may be a memorised chunk.
 *  applied     ≥ 2 independent application successes in ≥ 2 different transfer
 *              contexts — the definition of transfer is a context that differs.
 *  retained    an independent success ≥ 7 days after the first independent
 *              recall-level success (SM-2's second interval is 6 days).
 */
export const EVIDENCE_RULES = {
    recognizedWeight: 3,
    recalled: { successes: 2, days: 2 },
    produced: { successes: 2, contexts: 2 },
    applied: { successes: 2, contexts: 2 },
    retainedGapDays: 7,
    /** Recent window for "recent vs historical". */
    recentWindowDays: 14,
    /** Evidence weight halves every this many days (confidence only). */
    halfLifeDays: 14,
    /** Wilson z for an ~80% interval. */
    z: 1.28,
    /** Among the last N qualifying independent attempts, this many failures contradict a stage. */
    contradictionWindow: 3,
    contradictionFailures: 2,
    /** Penalty applied to confidence when recent evidence conflicts. */
    conflictPenalty: 0.6,
    /** Below this many independent attempts the item has "insufficient" evidence. */
    minAttemptsForStrength: 3,
    establishedConfidence: 0.5,
    maxEntries: 40,
} as const

const MODE_RANK: Record<EvidenceMode, number> = { view: 0, recognition: 1, recall: 2, production: 3, application: 4 }

const MODE_WEIGHT_FOR_RECOGNIZED: Record<EvidenceMode, number> = { view: 0, recognition: 1, recall: 2, production: 2, application: 2 }

export function dayIndex(timestamp: number): number {
    return Math.floor(timestamp / DAY_MS)
}

/** Counts toward progression: unaided, verified, successful. */
export function isQualifyingSuccess(entry: EvidenceEntry): boolean {
    return entry.ok === true && entry.independent && entry.verified
}

/** A real, unaided, verified attempt (success or failure) — failures count against the learner. */
export function isQualifyingAttempt(entry: EvidenceEntry): boolean {
    return entry.ok !== null && entry.independent && entry.verified && entry.mode !== 'view'
}

function qualifyingAtLeast(entries: EvidenceEntry[], mode: EvidenceMode): EvidenceEntry[] {
    return entries.filter(entry => MODE_RANK[entry.mode] >= MODE_RANK[mode])
}

function distinct<T>(values: T[]): number {
    return new Set(values).size
}

function evaluateStage(stage: EvidenceStage, entries: EvidenceEntry[]): StageEvidence {
    if (stage === 'exposed') {
        const any = entries.length > 0

        return { satisfied: any, qualifyingSuccesses: 0, distinctDays: distinct(entries.map(e => dayIndex(e.t))), distinctContexts: distinct(entries.map(e => e.ctx ?? '')), missing: any ? [] : ['Not seen yet'] }
    }

    if (stage === 'recognized') {
        const wins = qualifyingAtLeast(entries, 'recognition').filter(isQualifyingSuccess)
        const weight = wins.reduce((sum, entry) => sum + MODE_WEIGHT_FOR_RECOGNIZED[entry.mode], 0)
        const satisfied = weight >= EVIDENCE_RULES.recognizedWeight

        return {
            satisfied,
            qualifyingSuccesses: wins.length,
            distinctDays: distinct(wins.map(e => dayIndex(e.t))),
            distinctContexts: distinct(wins.map(e => e.ctx ?? '')),
            missing: satisfied ? [] : [`Needs more unaided correct answers (${weight} of ${EVIDENCE_RULES.recognizedWeight} evidence points)`],
        }
    }

    if (stage === 'recalled') {
        const wins = qualifyingAtLeast(entries, 'recall').filter(isQualifyingSuccess)
        const days = distinct(wins.map(e => dayIndex(e.t)))
        const rule = EVIDENCE_RULES.recalled
        const missing: string[] = []

        if (wins.length < rule.successes) missing.push(`${rule.successes - wins.length} more unaided recall success${rule.successes - wins.length === 1 ? '' : 'es'}`)
        if (days < rule.days) missing.push('A success on a different day')

        return { satisfied: !missing.length, qualifyingSuccesses: wins.length, distinctDays: days, distinctContexts: distinct(wins.map(e => e.ctx ?? '')), missing }
    }

    if (stage === 'produced') {
        const wins = qualifyingAtLeast(entries, 'production').filter(isQualifyingSuccess)
        const contexts = distinct(wins.map(e => e.ctx ?? ''))
        const rule = EVIDENCE_RULES.produced
        const missing: string[] = []

        if (wins.length < rule.successes) missing.push(`${rule.successes - wins.length} more sentence${rule.successes - wins.length === 1 ? '' : 's'} written unaided`)
        else if (contexts < rule.contexts) missing.push('A sentence for a different prompt')

        return { satisfied: !missing.length, qualifyingSuccesses: wins.length, distinctDays: distinct(wins.map(e => dayIndex(e.t))), distinctContexts: contexts, missing }
    }

    const wins = qualifyingAtLeast(entries, 'application').filter(isQualifyingSuccess)
    const contexts = distinct(wins.map(e => e.ctx ?? ''))
    const rule = EVIDENCE_RULES.applied
    const missing: string[] = []

    if (wins.length < rule.successes) missing.push(`${rule.successes - wins.length} more use${rule.successes - wins.length === 1 ? '' : 's'} in a new situation`)
    else if (contexts < rule.contexts) missing.push('Use it in a different situation')

    return { satisfied: !missing.length, qualifyingSuccesses: wins.length, distinctDays: distinct(wins.map(e => dayIndex(e.t))), distinctContexts: contexts, missing }
}

/** Attempts that bear on a stage, in time order, for contradiction checks. */
function attemptsFor(stage: EvidenceStage, entries: EvidenceEntry[]): EvidenceEntry[] {
    if (stage === 'exposed') return []

    const minimum: Record<Exclude<EvidenceStage, 'exposed'>, EvidenceMode> = {
        recognized: 'recognition',
        recalled: 'recall',
        produced: 'production',
        applied: 'application',
    }

    return qualifyingAtLeast(entries, minimum[stage]).filter(isQualifyingAttempt)
}

function isContradicted(stage: EvidenceStage, entries: EvidenceEntry[]): boolean {
    const recent = attemptsFor(stage, entries).slice(-EVIDENCE_RULES.contradictionWindow)

    return recent.length >= EVIDENCE_RULES.contradictionWindow && recent.filter(entry => entry.ok === false).length >= EVIDENCE_RULES.contradictionFailures
}

/** Wilson lower bound for k successes of n (n may be fractional after recency weighting). */
export function wilsonLower(successes: number, trials: number, z = EVIDENCE_RULES.z): number {
    if (trials <= 0) return 0

    const p = Math.min(1, Math.max(0, successes / trials))
    const denominator = 1 + (z * z) / trials
    const centre = p + (z * z) / (2 * trials)
    const margin = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))

    return Math.max(0, (centre - margin) / denominator)
}

export function wilsonUpper(successes: number, trials: number, z = EVIDENCE_RULES.z): number {
    if (trials <= 0) return 1

    const p = Math.min(1, Math.max(0, successes / trials))
    const denominator = 1 + (z * z) / trials
    const centre = p + (z * z) / (2 * trials)
    const margin = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))

    return Math.min(1, (centre + margin) / denominator)
}

function recencyWeight(entryTime: number, now: number): number {
    const ageDays = Math.max(0, (now - entryTime) / DAY_MS)

    return Math.pow(0.5, ageDays / EVIDENCE_RULES.halfLifeDays)
}

export function summarizeItem(item: ItemEvidence, now: number): ItemSummary {
    const entries = [...item.entries].sort((a, b) => a.t - b.t)

    const stages = Object.fromEntries(
        EVIDENCE_STAGES.map(stage => [stage, evaluateStage(stage, entries)])
    ) as Record<EvidenceStage, StageEvidence>

    /* Strict ladder, then lower it where recent independent attempts contradict it. */
    let ladderStage: EvidenceStage | null = null

    for (const stage of EVIDENCE_STAGES) {
        if (!stages[stage].satisfied) break

        ladderStage = stage
    }

    let contradicted = false

    while (ladderStage && ladderStage !== 'exposed' && isContradicted(ladderStage, entries)) {
        contradicted = true
        ladderStage = EVIDENCE_STAGES[EVIDENCE_STAGES.indexOf(ladderStage) - 1]
    }

    /* Retention: an independent recall-level success ≥ 7 days after the first one. */
    const recallWins = qualifyingAtLeast(entries, 'recall').filter(isQualifyingSuccess)
    const anchor = recallWins[0]?.t ?? null
    const lastWin = recallWins.length ? recallWins[recallWins.length - 1].t : null
    const longestRetainedDays = anchor !== null && lastWin !== null && lastWin > anchor ? Math.floor((lastWin - anchor) / DAY_MS) : null

    const lastRecallLevelAttempt = qualifyingAtLeast(entries, 'recall').filter(isQualifyingAttempt).slice(-1)[0]

    const retained =
        ladderStage !== null &&
        EVIDENCE_STAGES.indexOf(ladderStage) >= EVIDENCE_STAGES.indexOf('recalled') &&
        longestRetainedDays !== null &&
        longestRetainedDays >= EVIDENCE_RULES.retainedGapDays &&
        lastRecallLevelAttempt?.ok === true

    const stage: DerivedStage | null = retained ? 'retained' : ladderStage

    /* Confidence: recency-weighted, lower-bounded success estimate at the ladder's top stage. */
    const focusStage: EvidenceStage = ladderStage && ladderStage !== 'exposed' ? ladderStage : 'recognized'
    const focus = attemptsFor(focusStage, entries)

    let weightedWins = 0
    let weightedTrials = 0

    for (const attempt of focus) {
        const weight = recencyWeight(attempt.t, now)

        weightedTrials += weight
        if (attempt.ok) weightedWins += weight
    }

    const lastTwo = focus.slice(-2)
    const conflicting = lastTwo.length === 2 && lastTwo.some(attempt => attempt.ok) && lastTwo.some(attempt => !attempt.ok) && lastTwo[1].ok === false

    let confidence = wilsonLower(weightedWins, weightedTrials)

    if (conflicting || contradicted) confidence *= EVIDENCE_RULES.conflictPenalty

    const independentAttempts = entries.filter(isQualifyingAttempt)
    const independentSuccesses = entries.filter(isQualifyingSuccess).length
    const assistedSuccesses = entries.filter(entry => entry.ok === true && !entry.independent).length
    const unverifiedSuccesses = entries.filter(entry => entry.ok === true && entry.independent && !entry.verified).length

    let strength: EvidenceStrength

    if (!independentAttempts.length) strength = entries.length ? 'insufficient' : 'none'
    else if (independentAttempts.length < EVIDENCE_RULES.minAttemptsForStrength) strength = 'insufficient'
    else if (confidence >= EVIDENCE_RULES.establishedConfidence && ladderStage && EVIDENCE_STAGES.indexOf(ladderStage) >= EVIDENCE_STAGES.indexOf('recalled')) strength = 'established'
    else strength = 'emerging'

    const recentCutoff = now - EVIDENCE_RULES.recentWindowDays * DAY_MS
    const recentAttempts = independentAttempts.filter(entry => entry.t >= recentCutoff)
    const olderAttempts = independentAttempts.filter(entry => entry.t < recentCutoff)

    const tally = (list: EvidenceEntry[]) => ({ attempts: list.length, successes: list.filter(entry => entry.ok).length })

    return {
        key: item.key,
        kind: item.kind,
        ladderStage,
        stage,
        stages,
        evidenceCount: item.exposures + Object.values(item.counts).reduce((sum, c) => sum + c.attempts, 0),
        lastObservedAt: item.lastAt || (entries.length ? entries[entries.length - 1].t : null),
        firstSeenAt: item.firstSeenAt || null,
        independentSuccesses,
        assistedSuccesses,
        unverifiedSuccesses,
        confidence: Number(confidence.toFixed(3)),
        strength,
        conflicting,
        contradicted,
        recent: tally(recentAttempts),
        historical: tally(olderAttempts),
        longestRetainedDays,
        history: entries.slice(-EVIDENCE_RULES.maxEntries),
    }
}

export function emptyCounts(): ItemEvidence['counts'] {
    const zero = () => ({ attempts: 0, independentSuccess: 0, assistedSuccess: 0, failures: 0 })

    return { view: zero(), recognition: zero(), recall: zero(), production: zero(), application: zero() }
}
