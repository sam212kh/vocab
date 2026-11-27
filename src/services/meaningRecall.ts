import type { Word } from '../types/vocabulary'
import { getMeanings } from './vocabularyMeanings'

/**
 * Persian-aware loose equality for typed meaning answers: trims, unifies
 * Arabic/Persian letter variants (Arabic yeh/alef-maksura -> Persian yeh,
 * Arabic kaf -> Persian kaf) that keyboards and older content mix
 * interchangeably, strips Arabic diacritics and ZWNJ (so "می‌شود" and
 * "می شود" compare equal), and collapses punctuation/whitespace. No typo
 * tolerance — unlike English's `answersMatch`, a single wrong Persian
 * character usually changes the word entirely, so this stays exact after
 * normalization.
 */
export function normalizePersianText(value: string): string {
    return value
        .trim()
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/\u200C/g, ' ')
        .replace(/[؛،؟!.,]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
}

export interface MeaningRecallTarget {
    /** How many distinct verified meanings this word actually has — the number the question must state. Never hardcoded. */
    expectedCount: number
    /** Every distinct accepted Persian answer, in display order. */
    accepted: string[]
}

/** The one place that decides how many meanings a recall question should ask for, and what counts as correct — always derived from the word's own data (never guessed, never padded). */
export function meaningRecallTarget(word: Pick<Word, 'meaning' | 'synonyms'>): MeaningRecallTarget {
    const accepted = getMeanings(word, 10).map(entry => entry.text)

    return { expectedCount: accepted.length, accepted }
}

export interface MeaningRecallResult {
    /** Per input box, in the order given: whether it matched some not-yet-claimed accepted meaning. */
    matchedByInput: boolean[]
    /** True only when every box matched a distinct accepted meaning (order-independent — the learner can fill boxes in any order). */
    allCorrect: boolean
}

/**
 * Only the word's own verified meanings (primary senses + synonym glosses)
 * are ever accepted — never a fuzzy/semantic "close enough" match. This is
 * deliberate: inventing acceptance for an unlisted paraphrase would mean
 * guessing whether it is actually correct, which this app never does for
 * vocabulary data.
 */
export function checkMeaningRecall(inputs: string[], accepted: string[]): MeaningRecallResult {
    const remaining = accepted.map(normalizePersianText)

    const matchedByInput = inputs.map(input => {
        const normalized = normalizePersianText(input)
        if (!normalized) return false

        const index = remaining.indexOf(normalized)
        if (index === -1) return false

        remaining.splice(index, 1)
        return true
    })

    return {
        matchedByInput,
        allCorrect: matchedByInput.length > 0 && matchedByInput.every(Boolean),
    }
}
