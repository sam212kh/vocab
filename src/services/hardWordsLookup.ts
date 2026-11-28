import { loadLesson } from './vocabulary'
import type { Manifest, Word } from '../types/vocabulary'

/**
 * The one authoritative way to turn saved Hard Words (plain
 * `{word, meaning}` records — see stores/hardWords.ts) into full `Word`
 * objects with real pos/examples/synonyms/audio. Previously each screen
 * either duplicated an inline, fully-sequential scan of EVERY lesson in
 * EVERY course (ListenRepeatView — 372 individual network requests, one at
 * a time, just to find a handful of saved words) or skipped enrichment
 * entirely (HardWordsView — fast, but no examples/pos/synonyms to show).
 *
 * This fetches lessons CONCURRENTLY in bounded batches and stops as soon as
 * every saved word has been matched, instead of always walking the full
 * library. A saved word that can't be matched (e.g. it was saved from a
 * reading/listening passage rather than the vocabulary library, or the
 * underlying lesson content has since changed) is reported as `unmatched`
 * rather than silently dropped — callers decide how to explain that to the
 * learner instead of this function guessing.
 */

export interface HardWordsLookupResult {
    /** Full Word objects for every saved hard word that could be matched, in no particular order. */
    found: Word[]
    /** The saved `word` strings (lowercased, trimmed) that no lesson in the library matched. */
    unmatched: string[]
}

const LESSON_FETCH_CONCURRENCY = 16

export async function resolveFullHardWords(
    savedWords: readonly string[],
    manifest: Manifest
): Promise<HardWordsLookupResult> {
    const targets = new Set(savedWords.map(word => word.trim().toLowerCase()).filter(Boolean))

    if (!targets.size) return { found: [], unmatched: [] }

    const foundByKey = new Map<string, Word>()
    const allLessons = manifest.courses.flatMap(course => course.lessons)

    for (let start = 0; start < allLessons.length; start += LESSON_FETCH_CONCURRENCY) {
        const batch = allLessons.slice(start, start + LESSON_FETCH_CONCURRENCY)

        const results = await Promise.all(
            batch.map(async lesson => {
                try {
                    return await loadLesson(lesson)
                } catch (err) {
                    console.error(`Failed to load ${lesson.id}:`, err)
                    return []
                }
            })
        )

        for (const words of results) {
            for (const word of words) {
                const key = word.word.trim().toLowerCase()
                const expressions = [
                    ...(word.collocations ?? []),
                    ...(word.relatedExpressions ?? []),
                ].map(value => value.trim().toLowerCase())

                if (targets.has(key) && !foundByKey.has(key)) foundByKey.set(key, word)
                for (const target of targets) {
                    if (expressions.includes(target) && !foundByKey.has(target)) foundByKey.set(target, word)
                }
            }
        }

        if (foundByKey.size >= targets.size) break
    }

    const unmatched = [...targets].filter(key => !foundByKey.has(key))

    return { found: [...foundByKey.values()], unmatched }
}
