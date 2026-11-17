import { DAY_MS, EVIDENCE_RULES, isQualifyingAttempt, wilsonLower, wilsonUpper } from './evidenceEngine'

import { GAP_DIMENSIONS } from '../types/skillGap'
import type {
    DimensionResult,
    GapAction,
    GapClassification,
    GapConfidence,
    GapDimension,
    GapPattern,
    GapTrend,
    SkillGapReport,
} from '../types/skillGap'
import type { ItemEvidence } from '../types/evidence'
import type { PerformanceEvent } from '../types/performance'

/**
 * Skill Gap Analysis. PURE and deterministic.
 *
 * Every dimension is analysed independently from its own observations; a weak
 * dimension is reported ONLY when there is enough evidence (see GAP_RULES). With
 * less, the honest answer is "insufficient" — never a guessed weakness.
 */

export const GAP_RULES = {
    /** Same bar the Journey already uses for "weak skill" (accuracy < 70%). */
    target: 0.7,
    /** Independent observations needed before any classification. */
    minObservations: 8,
    /** …spread over at least this many different days (one sitting proves little). */
    minDays: 2,
    /** Both sides of a trend need this many observations. */
    minForTrend: 4,
    /** Accuracy change (points, 0-1) that counts as a trend. */
    trendDelta: 0.15,
    /** Confidence labels by volume. */
    highObservations: 20,
    highDays: 3,
    /** Gap-pattern thresholds (estimates in %). */
    patternStrong: 70,
    patternWeak: 55,
    patternMinDifference: 20,
} as const

interface Observation {
    t: number
    ok: boolean
}

const ACTIONS: Record<GapDimension, GapAction> = {
    vocabRecognition: { label: 'Quiz or matching on a lesson you know', to: '/quiz' },
    vocabRecall: { label: 'Active recall (type the English)', to: '/practice' },
    sentenceConstruction: { label: 'Build sentences in a Daily Journey', to: '/daily-journey' },
    grammarAccuracy: { label: 'Grammar topics with exercises', to: '/grammar' },
    listening: { label: 'Listening practice', to: '/listening' },
    reading: { label: 'Reading practice', to: '/reading' },
    writing: { label: 'Write and get feedback', to: '/writing' },
    speakingFluency: { label: 'Speaking practice', to: '/guided-speaking' },
    naturalExpression: { label: 'Conversation with the tutor', to: '/conversation' },
    contextualUsage: { label: 'Contextual application in a Daily Journey', to: '/daily-journey' },
}

export const DIMENSION_LABEL: Record<GapDimension, string> = {
    vocabRecognition: 'Vocabulary recognition',
    vocabRecall: 'Vocabulary recall',
    sentenceConstruction: 'Sentence construction',
    grammarAccuracy: 'Grammar accuracy',
    listening: 'Listening comprehension',
    reading: 'Reading comprehension',
    writing: 'Writing',
    speakingFluency: 'Speaking fluency',
    naturalExpression: 'Natural expression',
    contextualUsage: 'Contextual usage',
}

export const DIMENSION_LABEL_FA: Record<GapDimension, string> = {
    vocabRecognition: 'تشخیص واژگان',
    vocabRecall: 'یادآوری واژگان',
    sentenceConstruction: 'ساخت جمله',
    grammarAccuracy: 'دقت گرامری',
    listening: 'درک شنیداری',
    reading: 'درک مطلب',
    writing: 'نوشتن',
    speakingFluency: 'روانی گفتار',
    naturalExpression: 'بیان طبیعی',
    contextualUsage: 'کاربرد در موقعیت‌های جدید',
}

export interface GapInput {
    now: number
    items: ItemEvidence[]
    events: PerformanceEvent[]
}

function weightOf(t: number, now: number): number {
    return Math.pow(0.5, Math.max(0, (now - t) / DAY_MS) / EVIDENCE_RULES.halfLifeDays)
}

/**
 * Independent, verified attempts from the ledger. `pick` returns true/false to
 * count the entry as a success/failure for the dimension, or null when the
 * entry does not bear on it.
 */
function fromLedger(items: ItemEvidence[], pick: (key: string, mode: string, ok: boolean, q?: string) => boolean | null): Observation[] {
    const out: Observation[] = []

    for (const item of items) {
        for (const entry of item.entries) {
            if (!isQualifyingAttempt(entry)) continue

            const result = pick(item.key, entry.mode, entry.ok === true, entry.q)

            if (result !== null) out.push({ t: entry.t, ok: result })
        }
    }

    return out
}

function fromEvents(events: PerformanceEvent[], skill: PerformanceEvent['skill'], pick?: (event: PerformanceEvent) => boolean | null): Observation[] {
    const out: Observation[] = []

    for (const event of events) {
        if (event.skill !== skill) continue

        const result = pick ? pick(event) : event.result === 'correct'

        if (result !== null) out.push({ t: event.timestamp, ok: result })
    }

    return out
}

/** Of language-CORRECT sentences, were they also natural? Errors are counted elsewhere. */
function naturalness(q?: string): boolean | null {
    if (q === 'unnatural') return false

    return q === 'correct' || q === 'valid-alternative' ? true : null
}

function collect({ items, events }: GapInput): Record<GapDimension, Observation[]> {
    return {
        /* Choosing among options, for vocabulary (grammar topics are analysed under grammar). */
        vocabRecognition: fromLedger(items, (key, mode, ok) => (mode === 'recognition' && !key.startsWith('grammar:') && !key.startsWith('objective:') ? ok : null)),
        /* Typed / by-ear retrieval of vocabulary items, no options shown. */
        vocabRecall: fromLedger(items, (key, mode, ok) => (mode === 'recall' && key.startsWith('lex:') ? ok : null)),
        /* Whole sentences written unaided and judged by the sentence evaluator (basic checks are unverified → excluded). */
        sentenceConstruction: fromLedger(items, (key, mode, ok) => (mode === 'production' && key.startsWith('exercise:') ? ok : null)),
        grammarAccuracy: [
            ...fromEvents(events, 'grammar'),
            /* Writing events count for grammar only when they succeeded or failed BECAUSE of grammar / word order. */
            ...fromEvents(events, 'writing', event => {
                if (event.result === 'correct') return true

                return event.errorCategories.some(category => category === 'grammar' || category === 'word-order') ? false : null
            }),
        ],
        listening: fromEvents(events, 'listening'),
        reading: fromEvents(events, 'reading'),
        writing: fromEvents(events, 'writing'),
        /* Speaking events exist only for real voice input (typed answers never create them). */
        speakingFluency: fromEvents(events, 'speaking'),
        naturalExpression: fromLedger(items, (_key, mode, _ok, q) => (mode === 'production' || mode === 'application' ? naturalness(q) : null)),
        /* Using learned patterns in NEW situations (transfer tasks). */
        contextualUsage: fromLedger(items, (key, mode, ok) => (mode === 'application' && key.startsWith('pattern:') ? ok : null)),
    }
}

function tally(observations: Observation[]) {
    return { observations: observations.length, successes: observations.filter(o => o.ok).length }
}

function analyse(dimension: GapDimension, observations: Observation[], now: number): DimensionResult {
    const sorted = [...observations].sort((a, b) => a.t - b.t)
    const days = new Set(sorted.map(o => Math.floor(o.t / DAY_MS))).size

    const cutoff = now - EVIDENCE_RULES.recentWindowDays * DAY_MS
    const recent = tally(sorted.filter(o => o.t >= cutoff))
    const earlier = tally(sorted.filter(o => o.t < cutoff))

    let weightedWins = 0
    let weightedTrials = 0

    for (const observation of sorted) {
        const weight = weightOf(observation.t, now)

        weightedTrials += weight
        if (observation.ok) weightedWins += weight
    }

    const estimate = sorted.length ? Math.round((weightedWins / weightedTrials) * 100) : null

    let classification: GapClassification = 'insufficient'

    if (sorted.length >= GAP_RULES.minObservations && days >= GAP_RULES.minDays) {
        if (wilsonLower(weightedWins, weightedTrials) >= GAP_RULES.target) classification = 'strength'
        else if (wilsonUpper(weightedWins, weightedTrials) < GAP_RULES.target) classification = 'weakness'
        else classification = 'developing'
    }

    let trend: GapTrend = 'unknown'

    if (recent.observations >= GAP_RULES.minForTrend && earlier.observations >= GAP_RULES.minForTrend) {
        const delta = recent.successes / recent.observations - earlier.successes / earlier.observations

        trend = delta >= GAP_RULES.trendDelta ? 'improving' : delta <= -GAP_RULES.trendDelta ? 'declining' : 'steady'
    }

    const confidence: GapConfidence =
        sorted.length >= GAP_RULES.highObservations && days >= GAP_RULES.highDays
            ? 'high'
            : sorted.length >= GAP_RULES.minObservations && days >= GAP_RULES.minDays
                ? 'medium'
                : 'low'

    const label = DIMENSION_LABEL[dimension].toLowerCase()

    const why =
        classification === 'insufficient'
            ? sorted.length
                ? `Only ${sorted.length} independent observation${sorted.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'} — at least ${GAP_RULES.minObservations} across ${GAP_RULES.minDays} days are needed before judging ${label}.`
                : `No independent evidence for ${label} yet.`
            : classification === 'weakness'
                ? `${estimate}% over ${sorted.length} independent observations (${days} days), confidently below the ${GAP_RULES.target * 100}% target.`
                : classification === 'strength'
                    ? `${estimate}% over ${sorted.length} independent observations (${days} days), confidently above the ${GAP_RULES.target * 100}% target.`
                    : `${estimate}% over ${sorted.length} independent observations (${days} days) — close to the ${GAP_RULES.target * 100}% target, not yet conclusive.`

    return {
        dimension,
        estimate,
        classification,
        observations: sorted.length,
        distinctDays: days,
        recent,
        earlier,
        lastObservedAt: sorted.length ? sorted[sorted.length - 1].t : null,
        confidence,
        trend,
        why,
        /* A recommendation is attached only where there is something to act on. */
        recommendation: classification === 'weakness' || classification === 'developing' ? ACTIONS[dimension] : null,
    }
}

const usable = (result: DimensionResult) => result.classification !== 'insufficient' && result.estimate !== null

function detectPatterns(dimensions: DimensionResult[]): GapPattern[] {
    const by = Object.fromEntries(dimensions.map(d => [d.dimension, d])) as Record<GapDimension, DimensionResult>
    const patterns: GapPattern[] = []

    const gap = (strong: DimensionResult[], weak: DimensionResult[]) =>
        strong.every(usable) && weak.every(usable) &&
        Math.min(...strong.map(d => d.estimate!)) >= GAP_RULES.patternStrong &&
        Math.max(...weak.map(d => d.estimate!)) <= GAP_RULES.patternWeak &&
        Math.min(...strong.map(d => d.estimate!)) - Math.max(...weak.map(d => d.estimate!)) >= GAP_RULES.patternMinDifference

    const evidence = (list: DimensionResult[]) => list.map(d => ({ dimension: d.dimension, estimate: d.estimate! }))

    if (gap([by.vocabRecognition], [by.vocabRecall])) {
        patterns.push({
            id: 'recognition-without-recall',
            title: 'You recognize words you cannot yet recall',
            titlePersian: 'کلمه‌ها را می‌شناسی، اما هنوز نمی‌توانی آن‌ها را به یاد بیاوری',
            detail: `Recognition ${by.vocabRecognition.estimate}% vs recall ${by.vocabRecall.estimate}%.`,
            evidence: evidence([by.vocabRecognition, by.vocabRecall]),
            action: ACTIONS.vocabRecall,
        })
    }

    if (gap([by.sentenceConstruction], [by.naturalExpression])) {
        patterns.push({
            id: 'correct-but-unnatural',
            title: 'Your sentences are correct but often sound unnatural',
            titlePersian: 'جمله‌هایت درست است، اما اغلب طبیعی به نظر نمی‌رسد',
            detail: `Correct sentences ${by.sentenceConstruction.estimate}% vs natural ones ${by.naturalExpression.estimate}%.`,
            evidence: evidence([by.sentenceConstruction, by.naturalExpression]),
            action: ACTIONS.naturalExpression,
        })
    }

    const written = [by.reading, by.writing].filter(usable)
    const spoken = [by.listening, by.speakingFluency].filter(usable)

    if (written.length && spoken.length && gap([written.reduce((a, b) => (a.estimate! <= b.estimate! ? a : b))], [spoken.reduce((a, b) => (a.estimate! >= b.estimate! ? a : b))])) {
        const weak = spoken.reduce((a, b) => (a.estimate! >= b.estimate! ? a : b))
        const strong = written.reduce((a, b) => (a.estimate! <= b.estimate! ? a : b))

        patterns.push({
            id: 'reading-over-listening',
            title: 'You understand written English better than spoken English',
            titlePersian: 'انگلیسی نوشتاری را بهتر از انگلیسی گفتاری می‌فهمی',
            detail: `${DIMENSION_LABEL[strong.dimension]} ${strong.estimate}% vs ${DIMENSION_LABEL[weak.dimension].toLowerCase()} ${weak.estimate}%.`,
            evidence: evidence([strong, weak]),
            action: ACTIONS[weak.dimension],
        })
    }

    if (gap([by.vocabRecognition], [by.sentenceConstruction])) {
        patterns.push({
            id: 'choice-without-production',
            title: 'You pick correct answers but struggle to produce them',
            titlePersian: 'گزینهٔ درست را انتخاب می‌کنی، اما در تولید جمله مشکل داری',
            detail: `Recognition ${by.vocabRecognition.estimate}% vs sentence construction ${by.sentenceConstruction.estimate}%.`,
            evidence: evidence([by.vocabRecognition, by.sentenceConstruction]),
            action: ACTIONS.sentenceConstruction,
        })
    }

    if (gap([by.sentenceConstruction], [by.contextualUsage])) {
        patterns.push({
            id: 'no-transfer',
            title: 'You build simple sentences but do not yet transfer them to new situations',
            titlePersian: 'جمله‌های ساده می‌سازی، اما هنوز آن‌ها را در موقعیت‌های جدید به کار نمی‌بری',
            detail: `Sentence construction ${by.sentenceConstruction.estimate}% vs use in new contexts ${by.contextualUsage.estimate}%.`,
            evidence: evidence([by.sentenceConstruction, by.contextualUsage]),
            action: ACTIONS.contextualUsage,
        })
    }

    return patterns
}

export function analyzeSkillGaps(input: GapInput): SkillGapReport {
    const observations = collect(input)
    const dimensions = GAP_DIMENSIONS.map(dimension => analyse(dimension, observations[dimension], input.now))

    return { generatedAt: input.now, dimensions, patterns: detectPatterns(dimensions) }
}
