export interface ClozeMatch {
    start: number
    end: number
    text: string
    phrase: string
}

/** Normalize only typographical differences that do not change a phrase. */
export function normalizeClozePhrase(value: string): string {
    return value
        .normalize('NFKC')
        .replace(/[’ʻʼ]/g, "'")
        .replace(/[‐‑‒–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function phrasePattern(phrase: string): RegExp {
    const normalized = normalizeClozePhrase(phrase)
    const parts = normalized.split(' ')
    const body = parts
        .map(part => escapeRegExp(part)
            .replace(/['’ʻʼ]/g, "['’ʻʼ]")
            .replace(/[-‐‑‒–—]/g, '[-‐‑‒–—]'))
        .join('\\s+')

    // Unicode letter/number boundaries prevent "art" matching "partial"
    // while still allowing punctuation around phrases such as "a.m.".
    return new RegExp(
        `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`,
        'iu'
    )
}

export function findClozeMatch(
    sentence: string,
    phrases: readonly string[]
): ClozeMatch | null {
    let best: ClozeMatch | null = null

    for (const candidate of phrases) {
        const phrase = normalizeClozePhrase(candidate)
        if (!phrase) continue

        const match = phrasePattern(phrase).exec(sentence)
        if (!match) continue

        const found: ClozeMatch = {
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            phrase,
        }

        // Prefer the longest matching phrase when a short expression is also
        // contained in it (for example "go" and "go through").
        if (!best || found.text.length > best.text.length) best = found
    }

    return best
}
