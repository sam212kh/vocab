import { emptyCounts } from './evidenceEngine'
import { evidenceFromJourney, lexKey } from './evidenceBridge'

import type { EvidenceInput, ItemEvidence } from '../types/evidence'
import type { JourneyEvidenceRecord } from '../types/journey'
import type { WordProgress } from '../types/vocabulary'

/**
 * One-time fold of pre-ledger data into the ledger. PURE.
 *
 *  - Journey evidence already carries stage / independence / hints, so it is
 *    converted faithfully (production records keep no used-target list, so only
 *    recall and recognition become item-level evidence).
 *  - SRS counters (wordProgress) carry NO timing, independence or mode, so they
 *    cannot be turned into successes without inventing evidence. They become a
 *    single "seen" exposure plus a `legacy` note; the learner earns real
 *    stage evidence going forward.
 */
export function backfillLedger(input: {
    journeyEvidence: JourneyEvidenceRecord[]
    wordProgress: WordProgress[]
}): Record<string, ItemEvidence> {
    const items: Record<string, ItemEvidence> = {}

    const add = (entry: EvidenceInput) => {
        const at = entry.at ?? 0
        const independent = entry.independent ?? true
        const verified = entry.verified ?? true
        const item = items[entry.key] ?? (items[entry.key] = { key: entry.key, kind: entry.kind, firstSeenAt: at, lastAt: at, counts: emptyCounts(), exposures: 0, entries: [] })

        item.entries.push({ t: at, mode: entry.mode, ok: entry.mode === 'view' ? null : entry.ok, independent, verified, ...(entry.ctx ? { ctx: entry.ctx } : {}), ...(entry.skill ? { skill: entry.skill } : {}) })

        const counts = item.counts[entry.mode]

        counts.attempts++

        if (entry.mode === 'view') item.exposures++
        else if (entry.ok === true && independent && verified) counts.independentSuccess++
        else if (entry.ok === true) counts.assistedSuccess++
        else if (entry.ok === false) counts.failures++

        item.firstSeenAt = Math.min(item.firstSeenAt, at)
        item.lastAt = Math.max(item.lastAt, at)
    }

    for (const record of input.journeyEvidence) {
        for (const entry of evidenceFromJourney(record)) add(entry)
    }

    for (const progress of input.wordProgress) {
        if (!progress.correctAnswers && !progress.wrongAnswers) continue

        const at = progress.lastReviewedAt ?? 0
        const key = lexKey(progress.wordId)

        if (!items[key]) add({ key, kind: 'word', mode: 'view', ok: null, ctx: 'legacy-srs', at })

        items[key].legacy = { correct: progress.correctAnswers, wrong: progress.wrongAnswers }
    }

    for (const item of Object.values(items)) item.entries.sort((a, b) => a.t - b.t)

    return items
}
