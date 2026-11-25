import type { SynonymSense, Word } from '../types/vocabulary'
import type { RealLifeExpression } from '../types/realLife'

/**
 * Presentation model for the Learn experience. Both vocabulary words and
 * Real-Life expressions are adapted into it, so ONE set of Learn components
 * serves both without changing either data model.
 */

export interface LearnExample {
    english: string
    persian: string
}

export interface LearnMistake {
    wrong: string
    right: string
    why?: string
}

export interface LearnItem {
    /** Stable key (also the save/Hard-Words key). */
    id: string
    text: string
    /** Persian meaning. */
    meaning: string
    pos?: string
    level?: string
    examples: LearnExample[]
    /** Short in-context passage, when the content has one. */
    context?: string
    synonyms: SynonymSense[]
    /** Natural-usage explanation — only when the content genuinely has one. */
    usage?: string
    /** Common mistakes — only when the content genuinely has them. */
    mistakes: LearnMistake[]
}

export function itemFromWord(word: Word): LearnItem {
    return {
        id: word.word,
        text: word.word,
        meaning: word.meaning,
        pos: word.pos || undefined,
        level: word.level || undefined,
        examples: word.examples,
        context: word.miniContext || undefined,
        synonyms: word.synonyms,
        mistakes: [],
    }
}

export function itemFromExpression(expression: RealLifeExpression): LearnItem {
    return {
        id: expression.english,
        text: expression.english,
        meaning: expression.persian,
        examples: expression.example
            ? [{ english: expression.example, persian: expression.examplePersian }]
            : [],
        synonyms: [],
        usage: expression.note,
        mistakes: [],
    }
}

/* ---------- lexicon: tappable words inside example sentences ---------- */

export interface LexiconEntry {
    itemIndex: number
    text: string
    meaning: string
}

const MIN_LEXICON_CHARS = 3

export function buildLexicon(items: LearnItem[]): LexiconEntry[] {
    return items
        .map((item, itemIndex) => ({ itemIndex, text: item.text, meaning: item.meaning }))
        .filter(entry => entry.text.trim().length >= MIN_LEXICON_CHARS)
}

export interface TextToken {
    text: string
    /** Lexicon entry this slice refers to (null for plain text). */
    entry: LexiconEntry | null
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Splits a sentence into plain text and slices that are lesson words,
 * longest expression first, whole-word, tolerant of simple inflection
 * (achieve → achieved / achieving). Never loses or reorders text:
 * joining the tokens always reproduces the input exactly.
 */
export function tokenizeWithLexicon(text: string, lexicon: LexiconEntry[]): TextToken[] {
    if (!text) return []
    if (!lexicon.length) return [{ text, entry: null }]

    const byLower = new Map<string, LexiconEntry>()

    for (const entry of lexicon) {
        const key = entry.text.trim().toLowerCase()
        if (!byLower.has(key)) byLower.set(key, entry)
    }

    const alternatives = [...byLower.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')

    const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])(${alternatives})(?:s|es|ed|d|ing)?(?![\\p{L}\\p{N}])`,
        'giu'
    )

    const tokens: TextToken[] = []
    let cursor = 0

    for (const match of text.matchAll(pattern)) {
        const start = match.index ?? 0

        if (start > cursor) tokens.push({ text: text.slice(cursor, start), entry: null })

        tokens.push({ text: match[0], entry: byLower.get(match[1].toLowerCase()) ?? null })
        cursor = start + match[0].length
    }

    if (cursor < text.length) tokens.push({ text: text.slice(cursor), entry: null })

    return tokens
}

/* ---------- navigation helpers ---------- */

/** Validates `?w=<n>` (1-based) from a deep link; anything invalid → first item. */
export function parseWordIndex(raw: unknown, count: number): number {
    const value = Array.isArray(raw) ? raw[0] : raw

    if (typeof value !== 'string' || !/^\d{1,4}$/.test(value)) return 0

    const index = Number(value) - 1

    return index >= 0 && index < count ? index : 0
}

export function clampIndex(index: number, count: number): number {
    if (count <= 0) return 0

    return Math.min(Math.max(index, 0), count - 1)
}
