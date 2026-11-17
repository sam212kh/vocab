import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { LEDGER_KEY, migrateStored, useLearningEvidenceStore } from './learningEvidence'
import { backfillLedger } from '../services/evidenceMigration'
import { DAY_MS } from '../services/evidenceEngine'

import type { JourneyEvidenceRecord } from '../types/journey'
import type { WordProgress } from '../types/vocabulary'

beforeEach(() => setActivePinia(createPinia()))

const NOW = 50 * DAY_MS

describe('ledger store', () => {
    it('records, normalizes keys, persists and reloads', () => {
        const store = useLearningEvidenceStore()

        store.record({ key: 'lex:Put The Kettle On', kind: 'expression', mode: 'recall', ok: true, at: NOW })
        store.record({ key: 'lex:put the  kettle on', kind: 'expression', mode: 'recall', ok: false, at: NOW + 1000 })

        expect(Object.keys(store.items)).toEqual(['lex:put the kettle on'])
        expect(store.items['lex:put the kettle on'].counts.recall).toMatchObject({ attempts: 2, independentSuccess: 1, failures: 1 })

        setActivePinia(createPinia())
        expect(useLearningEvidenceStore().summaryFor('lex:PUT the kettle on', NOW + 5000)?.evidenceCount).toBe(2)
    })

    it('defaults to independent+verified, and counts assisted / unverified successes separately', () => {
        const store = useLearningEvidenceStore()

        store.record({ key: 'lex:a', kind: 'word', mode: 'recall', ok: true, at: NOW })
        store.record({ key: 'lex:a', kind: 'word', mode: 'recall', ok: true, independent: false, at: NOW + 1 })
        store.record({ key: 'lex:a', kind: 'word', mode: 'production', ok: true, verified: false, at: NOW + 2 })

        const summary = store.summaryFor('lex:a', NOW + 10)!

        expect(summary.independentSuccesses).toBe(1)
        expect(summary.assistedSuccesses).toBe(1)
        expect(summary.unverifiedSuccesses).toBe(1)
    })

    it('exposure is de-duplicated within a context for six hours, but a new context or a later day counts', () => {
        const store = useLearningEvidenceStore()

        store.expose('lex:b', 'word', 'lesson-1', NOW)
        store.expose('lex:b', 'word', 'lesson-1', NOW + 60_000)
        store.expose('lex:b', 'word', 'lesson-2', NOW + 120_000)
        store.expose('lex:b', 'word', 'lesson-1', NOW + DAY_MS)

        expect(store.items['lex:b'].exposures).toBe(3)
        expect(store.summaryFor('lex:b', NOW + DAY_MS)?.stage).toBe('exposed')
    })

    it('caps stored entries per item but keeps lifetime counts', () => {
        const store = useLearningEvidenceStore()

        for (let i = 0; i < 70; i++) store.record({ key: 'lex:c', kind: 'word', mode: 'recall', ok: true, at: NOW + i * 1000 })

        expect(store.items['lex:c'].entries).toHaveLength(40)
        expect(store.items['lex:c'].counts.recall.attempts).toBe(70)
    })

    it('recordMany saves once and keeps everything', () => {
        const store = useLearningEvidenceStore()

        store.recordMany([
            { key: 'lex:d', kind: 'word', mode: 'recognition', ok: true, at: NOW },
            { key: 'exercise:e1', kind: 'exercise', mode: 'recognition', ok: false, at: NOW },
        ])

        expect(Object.keys(store.items).sort()).toEqual(['exercise:e1', 'lex:d'])
    })
})

describe('storage safety and migration', () => {
    it('corrupted / foreign shapes read as an empty ledger and never crash', () => {
        for (const raw of ['{broken', JSON.stringify({ __version: 1, data: 'x' }), JSON.stringify({ __version: 1, data: { items: [] } }), JSON.stringify([1, 2]), JSON.stringify({ __version: 9, data: null })]) {
            localStorage.setItem(LEDGER_KEY, raw)
            setActivePinia(createPinia())
            expect(Object.keys(useLearningEvidenceStore().items)).toEqual([])
        }
    })

    it('entries with unknown independence are NOT credited (no credit by omission); invalid entries are dropped', () => {
        const state = migrateStored({
            items: {
                'lex:x': {
                    key: 'lex:x', kind: 'word', counts: { recall: { attempts: 'bad' } }, exposures: 1,
                    entries: [{ t: 1, mode: 'recall', ok: true }, { t: 'oops', mode: 'recall', ok: true }, { t: 2, mode: 'nonsense', ok: true }, { t: 3, mode: 'recall', ok: 'yes' }],
                },
                'lex:y': 'not an object',
            },
        })

        expect(Object.keys(state.items)).toEqual(['lex:x'])
        expect(state.items['lex:x'].entries).toHaveLength(1)
        expect(state.items['lex:x'].entries[0].independent).toBe(false)
        expect(state.items['lex:x'].counts.recall.attempts).toBe(0)
    })

    it('a stored ledger from this version round-trips unchanged', () => {
        const store = useLearningEvidenceStore()

        store.record({ key: 'lex:z', kind: 'word', mode: 'recall', ok: true, at: NOW })

        const before = JSON.stringify(store.items)

        setActivePinia(createPinia())
        expect(JSON.stringify(useLearningEvidenceStore().items)).toBe(before)
    })
})

describe('legacy backfill', () => {
    const journey = (over: Partial<JourneyEvidenceRecord>): JourneyEvidenceRecord => ({
        id: 'e', sessionId: 's', activityId: 'a', kind: 'vocab-retrieval', stage: 'recall', skill: 'vocabulary', itemKey: 'let it steep',
        correct: true, independent: true, hintsUsed: 0, modality: 'typed', completeness: null, timestamp: NOW, ...over,
    })
    const word = (over: Partial<WordProgress>): WordProgress => ({
        wordId: 'achieve', courseId: 'upgrade', lessonId: 'b1', status: 'mastered', level: 5, pos: 'verb', correctAnswers: 9, wrongAnswers: 1, streak: 6,
        lastReviewedAt: NOW - DAY_MS, nextReviewAt: NOW + DAY_MS, practicePriority: 0, easeFactor: 2.5, intervalDays: 21, ...over,
    })

    it('converts Journey evidence faithfully (hinted recall stays non-independent)', () => {
        const items = backfillLedger({ journeyEvidence: [journey({}), journey({ hintsUsed: 1, independent: false, timestamp: NOW + 1 })], wordProgress: [] })
        const item = items['lex:let it steep']

        expect(item.counts.recall).toMatchObject({ attempts: 2, independentSuccess: 1, assistedSuccess: 1 })
    })

    it('SRS counters become ONE exposure + a legacy note — never invented successes (even for "mastered" words)', () => {
        const items = backfillLedger({ journeyEvidence: [], wordProgress: [word({})] })
        const item = items['lex:achieve']

        expect(item.counts.recall.independentSuccess).toBe(0)
        expect(item.exposures).toBe(1)
        expect(item.legacy).toEqual({ correct: 9, wrong: 1 })
    })

    it('adoptBackfill runs once and never overwrites newer live evidence', () => {
        const store = useLearningEvidenceStore()

        store.record({ key: 'lex:achieve', kind: 'word', mode: 'recall', ok: true, at: NOW })
        store.adoptBackfill(backfillLedger({ journeyEvidence: [], wordProgress: [word({})] }))

        expect(store.items['lex:achieve'].counts.recall.independentSuccess).toBe(1)
        expect(store.backfilled).toBe(true)

        store.adoptBackfill({ 'lex:other': { key: 'lex:other', kind: 'word', firstSeenAt: 1, lastAt: 1, counts: store.items['lex:achieve'].counts, exposures: 0, entries: [] } })
        expect(store.items['lex:other']).toBeUndefined()
    })
})
