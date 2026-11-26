import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveFullHardWords } from './hardWordsLookup'
import { clearVocabularyCache } from './vocabulary'
import type { Manifest } from '../types/vocabulary'

function jsonResponse(body: unknown) {
    return { ok: true, json: async () => body } as Response
}

const manifest: Manifest = {
    version: 1,
    courses: [
        {
            id: 'upgrade',
            title: 'English Upgrade',
            lessons: [
                { id: 'batch-01', title: 'Batch 1', file: './batch-01.json', type: 'batch' },
                { id: 'batch-02', title: 'Batch 2', file: './batch-02.json', type: 'batch' },
            ],
        },
    ],
}

afterEach(() => {
    vi.unstubAllGlobals()
    clearVocabularyCache()
})

describe('resolveFullHardWords', () => {
    it('returns nothing to fetch for an empty saved-words list (no network calls)', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const result = await resolveFullHardWords([], manifest)

        expect(result).toEqual({ found: [], unmatched: [] })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('matches a saved word found in the vocabulary library, case/whitespace-insensitively', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
            if (url.includes('batch-01')) {
                return Promise.resolve(jsonResponse([{ word: 'obtain', meaning: 'به دست آوردن', examples: [] }]))
            }
            return Promise.resolve(jsonResponse([]))
        }))

        const result = await resolveFullHardWords(['  Obtain  '], manifest)

        expect(result.found).toHaveLength(1)
        expect(result.found[0].word).toBe('obtain')
        expect(result.unmatched).toEqual([])
    })

    it('reports a saved word with no matching lesson as unmatched, without fabricating a Word for it', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ word: 'obtain', meaning: 'x', examples: [] }])))

        const result = await resolveFullHardWords(['not-a-real-vocabulary-entry'], manifest)

        expect(result.found).toEqual([])
        expect(result.unmatched).toEqual(['not-a-real-vocabulary-entry'])
    })

    it('stops fetching once every target has been found (does not scan remaining lessons unnecessarily)', async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url.includes('batch-01')) return Promise.resolve(jsonResponse([{ word: 'obtain', meaning: 'x', examples: [] }]))
            return Promise.resolve(jsonResponse([]))
        })
        vi.stubGlobal('fetch', fetchMock)

        const manyLessonManifest: Manifest = {
            version: 1,
            courses: [{
                id: 'upgrade',
                title: 'English Upgrade',
                lessons: Array.from({ length: 20 }, (_, i) => ({
                    id: `batch-${String(i + 1).padStart(2, '0')}`,
                    title: `Batch ${i + 1}`,
                    file: `./batch-${String(i + 1).padStart(2, '0')}.json`,
                    type: 'batch' as const,
                })),
            }],
        }

        await resolveFullHardWords(['obtain'], manyLessonManifest)

        // With concurrency 16 and the match in the first lesson, only the first batch of 16 should ever be fetched.
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(16)
    })

    it('one lesson failing to load does not prevent matching a word found in another lesson', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
            if (url.includes('batch-01')) return Promise.resolve({ ok: false, json: async () => ({}) } as Response)
            if (url.includes('batch-02')) return Promise.resolve(jsonResponse([{ word: 'achieve', meaning: 'x', examples: [] }]))
            return Promise.resolve(jsonResponse([]))
        }))

        const result = await resolveFullHardWords(['achieve'], manifest)

        expect(result.found.map(w => w.word)).toEqual(['achieve'])
        expect(result.unmatched).toEqual([])
    })

    it('duplicate saved entries (same word twice) do not produce duplicate found results', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ word: 'obtain', meaning: 'x', examples: [] }])))

        const result = await resolveFullHardWords(['obtain', 'obtain', 'OBTAIN'], manifest)

        expect(result.found).toHaveLength(1)
    })
})
