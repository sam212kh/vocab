import type { Example, SynonymSense, Word } from '../types/vocabulary'

/**
 * Multi-meaning display (SRS multi-meaning fix). Root cause of the
 * "only one Persian meaning shown" bug was two-fold:
 *
 * 1. `services/vocabulary.ts`'s `normalizeSynonym` used to keep only
 *    `value[0]` (the English synonym), silently dropping `value[1]`
 *    (its Persian gloss) — real data the content authors provided,
 *    discarded at the parser before anything downstream ever saw it.
 *    Fixed directly in that file; `Word.synonyms` is now `SynonymSense[]`.
 * 2. Every SRS/Practice/Review screen rendered `word.meaning` as one raw
 *    string — even where it already held multiple senses joined by "؛"
 *    (e.g. "به دست آوردن؛ موفق شدن"), it was never split into a list.
 *
 * Everything here is a pure function over data that already exists on the
 * Word — nothing is generated or guessed. A word with one verified meaning
 * returns one meaning; this never pads to a target count.
 */

const SENSE_SEPARATORS = /[؛;]/

/** Splits the raw `meaning` field into its individual senses, trimmed, deduped, non-empty. */
export function splitPrimarySenses(meaning: string): string[] {
    const seen = new Set<string>()
    const senses: string[] = []

    for (const raw of meaning.split(SENSE_SEPARATORS)) {
        const sense = raw.trim()
        const key = sense.toLowerCase()

        if (sense && !seen.has(key)) {
            seen.add(key)
            senses.push(sense)
        }
    }

    return senses
}

export interface MeaningEntry {
    text: string
    /** 'primary' = from the word's own `meaning` field; 'synonym' = a distinct Persian gloss from `synonyms`. */
    source: 'primary' | 'synonym'
}

const DEFAULT_MAX_MEANINGS = 3

/**
 * The 1-3 most useful Persian meanings for a word: every distinct sense in
 * `meaning`, then any synonym glosses not already covered, capped at `max`.
 * Order is preserved (primary senses first, in their original order; then
 * synonyms, in their original order) — never reordered by "usefulness",
 * since there's no real signal for that beyond authoring order.
 */
export function getMeanings(
    word: Pick<Word, 'meaning' | 'synonyms'>,
    max = DEFAULT_MAX_MEANINGS
): MeaningEntry[] {
    const seen = new Set<string>()
    const entries: MeaningEntry[] = []

    for (const sense of splitPrimarySenses(word.meaning)) {
        const key = sense.toLowerCase()

        if (seen.has(key)) continue
        seen.add(key)
        entries.push({ text: sense, source: 'primary' })

        if (entries.length >= max) return entries
    }

    for (const synonym of word.synonyms) {
        const sense = synonym.meaning.trim()

        if (!sense) continue

        const key = sense.toLowerCase()

        if (seen.has(key)) continue
        seen.add(key)
        entries.push({ text: sense, source: 'synonym' })

        if (entries.length >= max) return entries
    }

    return entries
}

/** The single sense shown as the bare "what's the word?" prompt — always the first primary sense. */
export function primaryMeaning(word: Pick<Word, 'meaning'>): string {
    return splitPrimarySenses(word.meaning)[0] ?? word.meaning.trim()
}

export interface ReviewPrompt {
    /** The Persian text to show as the main prompt. */
    text: string
    /** True when another word in the pool shares the exact same primary meaning. */
    isAmbiguous: boolean
    /** A real example from this word's own data, shown as a smaller supporting line only when ambiguous. */
    contextExample: Example | null
}

/**
 * Different English words sometimes share the same bare Persian meaning
 * (obtain/achieve/acquire/gain all gloss close to "به دست آوردن"). Rather
 * than inventing a short collocation phrase that isn't in the data, an
 * ambiguous word's prompt is the primary meaning PLUS one of its own real
 * example sentences as a disambiguating context line — never a fabricated
 * phrase, and never silently presenting an ambiguous bare prompt either.
 */
export function pickReviewPrompt(word: Word, pool: readonly Word[]): ReviewPrompt {
    const text = primaryMeaning(word)
    const normalizedSelf = word.word.trim().toLowerCase()
    const key = text.toLowerCase()

    const isAmbiguous = pool.some(
        other => other.word.trim().toLowerCase() !== normalizedSelf && primaryMeaning(other).toLowerCase() === key
    )

    const contextExample = isAmbiguous ? (word.examples.find(example => example.english && example.persian) ?? null) : null

    return { text, isAmbiguous, contextExample }
}

/** Distinct English synonyms with a real Persian gloss — used where only "also known as" chips make sense (not a full meanings list). */
export function glossedSynonyms(synonyms: readonly SynonymSense[]): SynonymSense[] {
    return synonyms.filter(synonym => synonym.word && synonym.meaning)
}
