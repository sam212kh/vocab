import type {
    LearnedExpression,
    TransferAttempt,
    TransferContext,
    TransferPattern,
    TransferTask,
} from '../types/transfer'
import type { ItemEvidence } from '../types/evidence'

/**
 * Transfer learning: can the learner use a pattern they acquired in a NEW
 * situation? PURE and deterministic.
 *
 * - A pattern is only practised once the learner has acquired an expression
 *   built on it (recalled or better) — transfer follows acquisition.
 * - Tasks describe a situation and a goal ("ask for a quieter room"); the
 *   learner builds a new sentence. Nothing is a fill-in-the-blank template, and
 *   the reference sentences are examples, not the only valid answers (the
 *   sentence evaluator judges the learner's own wording).
 * - Difficulty rises with success: nearby situations → a different domain →
 *   the learner's own life.
 */

const ACQUIRED: LearnedExpression['stage'][] = ['recalled', 'produced', 'applied', 'retained']

/** Successful contexts needed to move up a level: 2 → level 2, 4 → level 3. */
export const TRANSFER_LEVEL_STEP = 2

/** A failed context becomes available again after this long. */
export const RETRY_AFTER_MS = 24 * 60 * 60 * 1000

const isCredit = (attempt: TransferAttempt) => attempt.ok && attempt.independent && attempt.verified

export function patternMatches(pattern: Pick<TransferPattern, 'matches'>, text: string): boolean {
    return pattern.matches.some(source => new RegExp(source, 'i').test(text))
}

/** The parts of the sentence that matched the pattern (for showing the learner what was recognised). */
export function matchedPhrases(pattern: Pick<TransferPattern, 'matches'>, text: string): string[] {
    return pattern.matches.flatMap(source => {
        const found = new RegExp(source, 'i').exec(text)

        return found ? [found[0]] : []
    })
}

export function acquiredAnchors(pattern: TransferPattern, learned: LearnedExpression[]): LearnedExpression[] {
    return learned.filter(item => ACQUIRED.includes(item.stage) && patternMatches(pattern, item.text))
}

export interface PatternProgress {
    patternId: string
    successfulContexts: string[]
    attemptedContexts: string[]
    level: 1 | 2 | 3
    /** ≥ 2 independent, verified successes in ≥ 2 different contexts. */
    transferred: boolean
    lastAttemptAt: number | null
}

export function patternProgress(patternId: string, history: TransferAttempt[]): PatternProgress {
    const mine = history.filter(attempt => attempt.patternId === patternId)
    const successful = [...new Set(mine.filter(isCredit).map(attempt => attempt.contextId))]
    const attempted = [...new Set(mine.map(attempt => attempt.contextId))]

    const level = (Math.min(3, 1 + Math.floor(successful.length / TRANSFER_LEVEL_STEP))) as 1 | 2 | 3

    return {
        patternId,
        successfulContexts: successful,
        attemptedContexts: attempted,
        level,
        transferred: successful.length >= 2,
        lastAttemptAt: mine.length ? Math.max(...mine.map(attempt => attempt.t)) : null,
    }
}

export interface SelectInput {
    patterns: TransferPattern[]
    learned: LearnedExpression[]
    history: TransferAttempt[]
    /** Context ids used in recent journeys (no-repeat). */
    recentContextIds?: string[]
    now: number
}

export type NoTaskReason = 'no-content' | 'no-acquired-expression' | 'all-contexts-done'

export function selectTransferTask(input: SelectInput): { task: TransferTask | null; reason: NoTaskReason | null } {
    if (!input.patterns.length) return { task: null, reason: 'no-content' }

    const recent = new Set(input.recentContextIds ?? [])

    const eligible = input.patterns
        .map(pattern => ({ pattern, anchors: acquiredAnchors(pattern, input.learned), progress: patternProgress(pattern.id, input.history) }))
        .filter(entry => entry.anchors.length)

    if (!eligible.length) return { task: null, reason: 'no-acquired-expression' }

    /* Least-practised first (fewest successful contexts), then least recently attempted, then stable by id. */
    eligible.sort((a, b) =>
        a.progress.successfulContexts.length - b.progress.successfulContexts.length ||
        (a.progress.lastAttemptAt ?? 0) - (b.progress.lastAttemptAt ?? 0) ||
        a.pattern.id.localeCompare(b.pattern.id)
    )

    for (const { pattern, anchors, progress } of eligible) {
        const context = chooseContext(pattern.contexts, progress, input.history, recent, input.now)

        if (!context) continue

        const anchor = [...anchors].sort((a, b) => a.text.localeCompare(b.text))[0]

        return { task: buildTask(pattern, context, anchor.text), reason: null }
    }

    return { task: null, reason: 'all-contexts-done' }
}

function chooseContext(
    contexts: TransferContext[],
    progress: PatternProgress,
    history: TransferAttempt[],
    recent: Set<string>,
    now: number
): TransferContext | null {
    const succeeded = new Set(progress.successfulContexts)

    const failedRecently = new Set(
        history
            .filter(attempt => attempt.patternId === progress.patternId && !isCredit(attempt) && now - attempt.t < RETRY_AFTER_MS)
            .map(attempt => attempt.contextId)
    )

    const available = contexts.filter(context => !succeeded.has(context.id) && !recent.has(context.id) && !failedRecently.has(context.id))

    if (!available.length) return null

    /* Never-attempted contexts first, then target level, then nearest level, then authoring order. */
    const attempted = new Set(progress.attemptedContexts)

    return [...available].sort((a, b) =>
        Number(attempted.has(a.id)) - Number(attempted.has(b.id)) ||
        Math.abs(a.level - progress.level) - Math.abs(b.level - progress.level) ||
        a.level - b.level ||
        contexts.indexOf(a) - contexts.indexOf(b)
    )[0]
}

function buildTask(pattern: TransferPattern, context: TransferContext, anchorExpression: string): TransferTask {
    return {
        patternId: pattern.id,
        contextId: context.id,
        level: context.level,
        patternTitle: pattern.title,
        patternTitlePersian: pattern.titlePersian,
        anchorExpression,
        matches: pattern.matches,
        open: context.open === true,
        learn: {
            frame: pattern.frame,
            explanation: pattern.explanation,
            explanationPersian: pattern.explanationPersian,
            example: pattern.example,
            examplePersian: pattern.examplePersian,
            feedback: context.feedback,
            feedbackPersian: context.feedbackPersian,
        },
        prompt: {
            id: `transfer:${pattern.id}:${context.id}`,
            promptEnglish: `${context.situation} ${context.goal}`,
            promptPersian: `${context.situationPersian} ${context.goalPersian}`,
            targetExpressions: context.targetPhrases,
            modelSentences: context.references,
        },
    }
}

/** Rebuilds transfer attempts from the evidence ledger (pattern items, application entries). */
export function attemptsFromLedger(items: ItemEvidence[]): TransferAttempt[] {
    const attempts: TransferAttempt[] = []

    for (const item of items) {
        if (!item.key.startsWith('pattern:')) continue

        const patternId = item.key.slice('pattern:'.length)

        for (const entry of item.entries) {
            if (entry.mode !== 'application' || entry.ok === null || !entry.ctx) continue

            attempts.push({ patternId, contextId: entry.ctx, ok: entry.ok, independent: entry.independent, verified: entry.verified, t: entry.t })
        }
    }

    return attempts
}

/** Shallow check used ONLY when no AI evaluation is available. Its result is recorded as UNVERIFIED. */
export function basicTransferCheck(sentence: string, pattern: Pick<TransferPattern, 'matches'>, context: Pick<TransferContext, 'targetPhrases'>): boolean {
    const words = sentence.trim().split(/\s+/).filter(Boolean).length
    const lower = sentence.toLowerCase()

    return words >= 4 && (patternMatches(pattern, sentence) || context.targetPhrases.some(phrase => lower.includes(phrase.toLowerCase())))
}
