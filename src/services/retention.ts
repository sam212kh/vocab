import { DAY_MS, isQualifyingAttempt, isQualifyingSuccess } from './evidenceEngine'

import type { EvidenceEntry, ItemEvidence } from '../types/evidence'

/**
 * Delayed-retention measurement. PURE.
 *
 * This module MEASURES; it never schedules. The SM-2 scheduler (wordProgress)
 * decides when a word comes back. Here we look at what happened when it did:
 * did the learner, unaided, still recall the item ≥ 1 / 3 / 7 / 14 days after
 * they first recalled it? Completing a scheduled review is not retention —
 * only an independent, verified success after the delay is.
 */

export const RETENTION_HORIZONS = [1, 3, 7, 14] as const
export type RetentionHorizon = (typeof RETENTION_HORIZONS)[number]

export const RETENTION_RULES = {
    /** A test counts for horizon h when it happens ≥ 0.9·h days after the anchor (a "next-day" review at 22 h is still next-day). */
    tolerance: 0.9,
    /** After the horizon is reached, how long an untested item stays "due" before it is "missed": max(2 days, half the horizon). */
    graceDays: (horizon: number) => Math.max(2, horizon / 2),
    /** SRS overdue beyond this many days = a missed review. */
    overdueDays: 7,
} as const

export type HorizonStatus = 'pending' | 'due' | 'missed' | 'retained' | 'lost'

export interface HorizonResult {
    horizon: RetentionHorizon
    status: HorizonStatus
    /** When the deciding test happened (retained/lost only). */
    testedAt: number | null
}

export interface ItemRetention {
    key: string
    anchorAt: number
    horizons: HorizonResult[]
    /** Largest horizon (days) with a successful delayed test; 0 when none. */
    retainedDays: number
    /** Smallest horizon at which a delayed test FAILED, if any. */
    lostAtDays: number | null
    /** Horizons waiting for a test right now (within their grace period). */
    dueHorizons: RetentionHorizon[]
    /** Horizons whose test never happened and whose grace period has passed. */
    missedHorizons: RetentionHorizon[]
}

const isRecallLevel = (entry: EvidenceEntry) => entry.mode === 'recall' || entry.mode === 'production' || entry.mode === 'application'

export function retentionForItem(item: ItemEvidence, now: number): ItemRetention | null {
    const entries = [...item.entries].sort((a, b) => a.t - b.t).filter(isRecallLevel)
    const anchor = entries.find(isQualifyingSuccess)

    if (!anchor) return null

    const later = entries.filter(entry => entry.t > anchor.t && isQualifyingAttempt(entry))

    const horizons: HorizonResult[] = RETENTION_HORIZONS.map(horizon => {
        const threshold = anchor.t + horizon * RETENTION_RULES.tolerance * DAY_MS
        const test = later.find(entry => entry.t >= threshold)

        if (test) return { horizon, status: test.ok ? 'retained' : 'lost', testedAt: test.t }

        if (now < threshold) return { horizon, status: 'pending', testedAt: null }

        const graceEnds = anchor.t + (horizon + RETENTION_RULES.graceDays(horizon)) * DAY_MS

        return { horizon, status: now <= graceEnds ? 'due' : 'missed', testedAt: null }
    })

    const retained = horizons.filter(h => h.status === 'retained').map(h => h.horizon)
    const lost = horizons.filter(h => h.status === 'lost').map(h => h.horizon)

    return {
        key: item.key,
        anchorAt: anchor.t,
        horizons,
        retainedDays: retained.length ? Math.max(...retained) : 0,
        lostAtDays: lost.length ? Math.min(...lost) : null,
        dueHorizons: horizons.filter(h => h.status === 'due').map(h => h.horizon),
        missedHorizons: horizons.filter(h => h.status === 'missed').map(h => h.horizon),
    }
}

export interface SrsSnapshot {
    key: string
    status: string
    nextReviewAt: number | null
}

export interface MetricRate {
    successes: number
    total: number
    /** 0-100, null when nothing was measured. */
    rate: number | null
}

export interface RetentionReport {
    tracked: number
    perHorizon: { horizon: RetentionHorizon; retained: number; lost: number; due: number; missed: number; pending: number }[]
    /** The four metrics, kept apart on purpose. */
    metrics: {
        immediateSuccess: MetricRate
        delayedRecall: MetricRate
        independentProduction: MetricRate
        contextualTransfer: MetricRate
    }
    /** Items the SRS calls "mastered" whose evidence does not yet reach recall on two days. */
    srsOptimistic: string[]
    /** SRS reviews overdue by more than a week. */
    missedReviews: string[]
    /** Items with an untested (due OR missed) horizon, oldest first — what a retention check should cover. */
    dueForRetentionCheck: string[]
}

const rate = (successes: number, total: number): MetricRate => ({ successes, total, rate: total ? Math.round((successes / total) * 100) : null })

export function buildRetentionReport(items: ItemEvidence[], now: number, srs: SrsSnapshot[] = []): RetentionReport {
    const perHorizon = RETENTION_HORIZONS.map(horizon => ({ horizon, retained: 0, lost: 0, due: 0, missed: 0, pending: 0 }))
    const retentions: ItemRetention[] = []

    let immediateOk = 0
    let immediateTotal = 0
    let productionOk = 0
    let productionTotal = 0
    let transferOk = 0
    let transferTotal = 0

    for (const item of items) {
        const entries = [...item.entries].sort((a, b) => a.t - b.t)
        const lexical = item.key.startsWith('lex:')

        /* Immediate success: the first independent attempt, on the same day the item was first seen. */
        if (lexical && entries.length) {
            const firstDay = Math.floor(entries[0].t / DAY_MS)
            const first = entries.find(isQualifyingAttempt)

            if (first && Math.floor(first.t / DAY_MS) === firstDay) {
                immediateTotal++
                if (first.ok) immediateOk++
            }
        }

        if (lexical) {
            const production = entries.filter(entry => entry.mode === 'production' && isQualifyingAttempt(entry))

            if (production.length) {
                productionTotal++
                if (production.some(entry => entry.ok)) productionOk++
            }
        }

        if (item.key.startsWith('pattern:')) {
            const application = entries.filter(entry => entry.mode === 'application' && isQualifyingAttempt(entry))

            if (application.length) {
                transferTotal++
                if (application.some(entry => entry.ok)) transferOk++
            }
        }

        if (!lexical) continue

        const retention = retentionForItem(item, now)

        if (!retention) continue

        retentions.push(retention)

        for (const result of retention.horizons) perHorizon.find(row => row.horizon === result.horizon)![result.status]++
    }

    /* Delayed recall: of the delayed tests that happened at ≥ 1 day, how many were passed. */
    const tested = perHorizon.find(row => row.horizon === 1)!
    const delayedRecall = rate(tested.retained, tested.retained + tested.lost)

    const byKey = new Map(items.map(item => [item.key, item]))

    const srsOptimistic = srs
        .filter(entry => entry.status === 'mastered')
        .map(entry => entry.key)
        .filter(key => {
            const item = byKey.get(key)

            if (!item) return true

            const wins = item.entries.filter(entry => isRecallLevel(entry) && isQualifyingSuccess(entry))

            return wins.length < 2 || new Set(wins.map(entry => Math.floor(entry.t / DAY_MS))).size < 2
        })

    const missedReviews = srs
        .filter(entry => entry.nextReviewAt !== null && now - entry.nextReviewAt > RETENTION_RULES.overdueDays * DAY_MS)
        .map(entry => entry.key)

    const dueForRetentionCheck = retentions
        .filter(retention => retention.dueHorizons.length || retention.missedHorizons.length)
        .sort((a, b) => a.anchorAt - b.anchorAt)
        .map(retention => retention.key)

    return {
        tracked: retentions.length,
        perHorizon,
        metrics: {
            immediateSuccess: rate(immediateOk, immediateTotal),
            delayedRecall,
            independentProduction: rate(productionOk, productionTotal),
            contextualTransfer: rate(transferOk, transferTotal),
        },
        srsOptimistic,
        missedReviews,
        dueForRetentionCheck,
    }
}
