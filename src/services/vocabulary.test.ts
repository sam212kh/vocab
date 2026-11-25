import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadLesson, loadManifest } from './vocabulary'

import type { LessonManifest, Manifest } from '../types/vocabulary'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as Response
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('loadManifest', () => {
    it('fetches /data/manifest.json and stamps courseId onto every lesson', async () => {
        const manifest: Manifest = {
            version: 1,
            courses: [
                {
                    id: 'course-a',
                    title: 'Course A',
                    lessons: [
                        { id: 'lesson-1', title: 'Lesson 1', file: './lesson-1.json', type: 'lesson' },
                    ],
                },
            ],
        }

        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(manifest))
        vi.stubGlobal('fetch', fetchMock)

        const result = await loadManifest()

        expect(fetchMock).toHaveBeenCalledWith('/data/manifest.json', expect.any(Object))
        expect(result.courses[0].lessons[0].courseId).toBe('course-a')
    })

    it('throws when the manifest response is not ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, false, 500)))

        await expect(loadManifest()).rejects.toThrow()
    })

    it('throws when the manifest shape is invalid', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ not: 'a manifest' })))

        await expect(loadManifest()).rejects.toThrow('Invalid manifest format')
    })
})

describe('loadLesson', () => {
    const lesson: LessonManifest = {
        id: 'lesson-1',
        title: 'Lesson 1',
        file: './lesson-1.json',
        type: 'lesson',
        courseId: 'course-a',
    }

    it('normalizes examples given as [english, persian] tuples', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse([
            {
                word: 'abundant',
                meaning: 'فراوان',
                examples: [['There is abundant evidence.', 'شواهد فراوانی وجود دارد.']],
                synonyms: ['plentiful'],
            },
        ]))
        vi.stubGlobal('fetch', fetchMock)

        const words = await loadLesson(lesson)

        expect(fetchMock).toHaveBeenCalledWith(
            '/data/lesson-1.json?v=1',
            { cache: 'no-store' },
        )
        expect(words).toHaveLength(1)
        expect(words[0].examples[0]).toEqual({
            english: 'There is abundant evidence.',
            persian: 'شواهد فراوانی وجود دارد.',
        })
        expect(words[0].courseId).toBe('course-a')
        expect(words[0].lessonId).toBe('lesson-1')
    })

    it('SRS does not silently discard a synonym\'s Persian gloss (the multi-meaning root cause)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
            {
                word: 'obtain',
                meaning: 'به دست آوردن',
                examples: [],
                synonyms: [['acquire', 'کسب کردن'], ['get', 'گرفتن']],
            },
        ])))

        const words = await loadLesson(lesson)

        expect(words[0].synonyms).toEqual([
            { word: 'acquire', meaning: 'کسب کردن' },
            { word: 'get', meaning: 'گرفتن' },
        ])
    })

    it('a legacy plain-string synonym (no gloss) normalizes to an empty meaning, not a crash or a guess', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
            { word: 'abundant', meaning: 'فراوان', examples: [], synonyms: ['plentiful'] },
        ])))

        const words = await loadLesson(lesson)

        expect(words[0].synonyms).toEqual([{ word: 'plentiful', meaning: '' }])
    })

    it('preserves explicit Cloze inflection variants', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
            { word: 'cease', clozeVariants: ['ceased'], examples: [] },
        ])))

        const words = await loadLesson(lesson)

        expect(words[0].clozeVariants).toEqual(['ceased'])
    })

    it('normalizes examples given as {english, persian} objects', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
            {
                word: 'abstain',
                meaning: 'خودداری کردن',
                examples: [{ english: 'He decided to abstain.', persian: 'او تصمیم گرفت خودداری کند.' }],
            },
        ])))

        const words = await loadLesson(lesson)

        expect(words[0].examples[0].english).toBe('He decided to abstain.')
    })

    it('drops entries with no word after normalization', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([
            { word: '', meaning: 'empty' },
            { word: 'valid', meaning: 'has a word' },
        ])))

        const words = await loadLesson(lesson)

        expect(words).toHaveLength(1)
        expect(words[0].word).toBe('valid')
    })

    it('throws when the lesson response is not an array', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ not: 'an array' })))

        await expect(loadLesson(lesson)).rejects.toThrow('Invalid lesson format')
    })
})
