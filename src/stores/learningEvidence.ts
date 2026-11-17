import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { emptyCounts, summarizeItem, EVIDENCE_RULES } from '../services/evidenceEngine'
import { normalizeKey } from '../services/evidenceBridge'

import type { EvidenceEntry, EvidenceInput, EvidenceMode, ItemEvidence, ItemSummary } from '../types/evidence'

/**
 * The evidence ledger: compact per-item entries. It holds FACTS about what the
 * learner did, never a verdict — verdicts are derived on read by
 * services/evidenceEngine.ts. It does not replace PerformanceEvents (skill
 * analytics) or the SRS (scheduling); it fills the gap neither covers: item-level
 * history with independence, verification and context.
 */

export const LEDGER_KEY = 'english-upgrade-learning-evidence'
export const LEDGER_VERSION = 1

const MAX_ITEMS = 3000
/** A repeat view of the same item in the same context within this window is one exposure. */
const EXPOSURE_DEDUPE_MS = 6 * 60 * 60 * 1000

export interface LedgerState {
    items: Record<string, ItemEvidence>
    /** Legacy (pre-ledger) data has been folded in once. */
    backfilled: boolean
}

const repository = createVersionedRepository<LedgerState>({
    key: LEDGER_KEY,
    version: LEDGER_VERSION,
    defaultValue: () => ({ items: {}, backfilled: false }),
    migrate: migrateStored,
})

const MODES: EvidenceMode[] = ['view', 'recognition', 'recall', 'production', 'application']

export const useLearningEvidenceStore = defineStore('learningEvidence', () => {
    const { value: initial } = repository.load()

    const items = ref<Record<string, ItemEvidence>>(initial.items)
    const backfilled = ref(initial.backfilled)

    function save() {
        repository.save({ items: items.value, backfilled: backfilled.value })
    }

    function prune() {
        const keys = Object.keys(items.value)

        if (keys.length <= MAX_ITEMS) return

        keys.sort((a, b) => items.value[a].lastAt - items.value[b].lastAt)

        for (const key of keys.slice(0, keys.length - MAX_ITEMS)) delete items.value[key]
    }

    function apply(input: EvidenceInput, persist: boolean) {
        const at = input.at ?? Date.now()
        const independent = input.independent ?? true
        const verified = input.verified ?? true

        /* Normalize "<kind>:<text>" keys so the same item always lands in one bucket. */
        const separator = input.key.indexOf(':')
        const key = separator > 0 ? `${input.key.slice(0, separator)}:${normalizeKey(input.key.slice(separator + 1))}` : normalizeKey(input.key)

        let item = items.value[key]

        if (!item) {
            item = { key, kind: input.kind, firstSeenAt: at, lastAt: at, counts: emptyCounts(), exposures: 0, entries: [] }
            items.value[key] = item
        }

        if (input.mode === 'view') {
            const previous = [...item.entries].reverse().find(entry => entry.mode === 'view' && (entry.ctx ?? '') === (input.ctx ?? ''))

            if (previous && at - previous.t < EXPOSURE_DEDUPE_MS) return
        }

        const entry: EvidenceEntry = {
            t: at,
            mode: input.mode,
            ok: input.mode === 'view' ? null : input.ok,
            independent,
            verified,
            ...(input.ctx ? { ctx: input.ctx } : {}),
            ...(input.skill ? { skill: input.skill } : {}),
            ...(input.q ? { q: input.q } : {}),
        }

        item.entries.push(entry)
        if (item.entries.length > EVIDENCE_RULES.maxEntries) item.entries = item.entries.slice(-EVIDENCE_RULES.maxEntries)

        const counts = item.counts[input.mode]

        counts.attempts++

        if (input.mode === 'view') item.exposures++
        else if (input.ok === true && independent && verified) counts.independentSuccess++
        else if (input.ok === true) counts.assistedSuccess++
        else if (input.ok === false) counts.failures++

        item.firstSeenAt = Math.min(item.firstSeenAt || at, at)
        item.lastAt = Math.max(item.lastAt, at)

        if (persist) {
            prune()
            save()
        }
    }

    function record(input: EvidenceInput) {
        apply(input, true)
    }

    function recordMany(inputs: EvidenceInput[]) {
        for (const input of inputs) apply(input, false)

        prune()
        save()
    }

    function expose(key: string, kind: EvidenceInput['kind'], ctx?: string, at?: number) {
        apply({ key, kind, mode: 'view', ok: null, ctx, at }, true)
    }

    function summaryFor(key: string, now = Date.now()): ItemSummary | null {
        const item = items.value[normalizedKey(key)]

        return item ? summarizeItem(item, now) : null
    }

    function summaries(now = Date.now()): ItemSummary[] {
        return Object.values(items.value).map(item => summarizeItem(item, now))
    }

    /** Folds pre-ledger data in exactly once (see services/evidenceMigration.ts). */
    function adoptBackfill(legacy: Record<string, ItemEvidence>) {
        if (backfilled.value) return

        for (const [key, item] of Object.entries(legacy)) {
            const existing = items.value[key]

            if (!existing) items.value[key] = item
            else if (!existing.legacy && item.legacy) existing.legacy = item.legacy
        }

        backfilled.value = true
        prune()
        save()
    }

    function clear() {
        items.value = {}
        backfilled.value = false
        save()
    }

    return { items, backfilled, record, recordMany, expose, summaryFor, summaries, adoptBackfill, clear }
})

function normalizedKey(key: string): string {
    const separator = key.indexOf(':')

    return separator > 0 ? `${key.slice(0, separator)}:${normalizeKey(key.slice(separator + 1))}` : normalizeKey(key)
}

function sanitizeCounts(raw: unknown): ItemEvidence['counts'] {
    const counts = emptyCounts()

    if (!raw || typeof raw !== 'object') return counts

    for (const mode of MODES) {
        const source = (raw as Record<string, Record<string, unknown>>)[mode]

        if (!source || typeof source !== 'object') continue

        const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0)

        counts[mode] = { attempts: num(source.attempts), independentSuccess: num(source.independentSuccess), assistedSuccess: num(source.assistedSuccess), failures: num(source.failures) }
    }

    return counts
}

function sanitizeEntry(raw: unknown): EvidenceEntry | null {
    if (!raw || typeof raw !== 'object') return null

    const value = raw as Partial<EvidenceEntry>

    if (typeof value.t !== 'number' || !Number.isFinite(value.t) || !MODES.includes(value.mode as EvidenceMode)) return null
    if (value.ok !== null && typeof value.ok !== 'boolean') return null

    return {
        t: value.t,
        mode: value.mode as EvidenceMode,
        ok: value.ok as boolean | null,
        /* Unknown independence defaults to NOT independent: never grant credit by omission. */
        independent: value.independent === true,
        verified: value.verified !== false,
        ...(typeof value.ctx === 'string' ? { ctx: value.ctx } : {}),
        ...(typeof value.skill === 'string' ? { skill: value.skill } : {}),
        ...(typeof value.q === 'string' ? { q: value.q } : {}),
    }
}

export function migrateStored(raw: unknown): LedgerState {
    const empty: LedgerState = { items: {}, backfilled: false }

    if (!raw || typeof raw !== 'object') return empty

    const source = raw as Partial<LedgerState>
    const items: Record<string, ItemEvidence> = {}

    if (source.items && typeof source.items === 'object') {
        for (const [key, value] of Object.entries(source.items)) {
            if (!value || typeof value !== 'object' || typeof key !== 'string') continue

            const item = value as Partial<ItemEvidence>
            const entries = (Array.isArray(item.entries) ? item.entries : []).map(sanitizeEntry).filter((entry): entry is EvidenceEntry => !!entry)
            const times = entries.map(entry => entry.t)

            items[key] = {
                key,
                kind: typeof item.kind === 'string' ? item.kind : 'word',
                firstSeenAt: typeof item.firstSeenAt === 'number' ? item.firstSeenAt : times.length ? Math.min(...times) : 0,
                lastAt: typeof item.lastAt === 'number' ? item.lastAt : times.length ? Math.max(...times) : 0,
                counts: sanitizeCounts(item.counts),
                exposures: typeof item.exposures === 'number' && item.exposures >= 0 ? Math.floor(item.exposures) : 0,
                entries: entries.slice(-EVIDENCE_RULES.maxEntries),
                ...(item.legacy && typeof item.legacy.correct === 'number' ? { legacy: { correct: item.legacy.correct, wrong: Number(item.legacy.wrong) || 0 } } : {}),
            }
        }
    }

    return { items, backfilled: source.backfilled === true }
}
