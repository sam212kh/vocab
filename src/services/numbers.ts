/**
 * Reusable number utilities for English learning content.
 *
 * - numberToEnglishWords / numberToPersianWords: display helpers
 * - englishWordsToNumber: parse a cardinal word phrase ("twenty-one")
 * - normalizeNumbersInText: canonicalize a sentence so "10" and "ten"
 *   compare equal, WITHOUT ever conflating different values
 * - annotateNumbers: extract numbers from a sentence for learning display
 *
 * Deliberately conservative: cardinals (plus simple decimals read as
 * "point five zero") only. Ordinals, dates, times, currencies and other
 * ambiguous readings are NOT auto-converted — content should list those as
 * explicit acceptedAnswers instead.
 */

const ONES = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
]

const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

const SCALES: [number, string][] = [
    [1000000000, 'billion'],
    [1000000, 'million'],
    [1000, 'thousand'],
]

const WORD_VALUES = new Map<string, number>()

ONES.forEach((word, value) => WORD_VALUES.set(word, value))
TENS.forEach((word, index) => { if (word) WORD_VALUES.set(word, index * 10) })

const SCALE_VALUES = new Map<string, number>([
    ['hundred', 100],
    ['thousand', 1000],
    ['million', 1000000],
    ['billion', 1000000000],
])

export function numberToEnglishWords(value: number): string {
    if (!Number.isFinite(value) || value < 0) return String(value)

    if (!Number.isInteger(value)) {
        const [whole, fraction] = String(value).split('.')
        const digits = [...(fraction ?? '')].map(d => ONES[Number(d)]).join(' ')
        return `${numberToEnglishWords(Number(whole))} point ${digits}`
    }

    if (value < 20) return ONES[value]

    if (value < 100) {
        const tens = TENS[Math.floor(value / 10)]
        const rest = value % 10
        return rest ? `${tens}-${ONES[rest]}` : tens
    }

    if (value < 1000) {
        const hundreds = `${ONES[Math.floor(value / 100)]} hundred`
        const rest = value % 100
        return rest ? `${hundreds} ${numberToEnglishWords(rest)}` : hundreds
    }

    for (const [scale, name] of SCALES) {
        if (value >= scale) {
            const major = `${numberToEnglishWords(Math.floor(value / scale))} ${name}`
            const rest = value % scale
            return rest ? `${major} ${numberToEnglishWords(rest)}` : major
        }
    }

    return String(value)
}

const PERSIAN_ONES = [
    'صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه',
    'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده',
    'هفده', 'هجده', 'نوزده',
]

const PERSIAN_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']

const PERSIAN_HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']

const PERSIAN_SCALES: [number, string][] = [
    [1000000000, 'میلیارد'],
    [1000000, 'میلیون'],
    [1000, 'هزار'],
]

export function numberToPersianWords(value: number): string {
    if (!Number.isFinite(value) || value < 0) return String(value)

    if (!Number.isInteger(value)) {
        const [whole, fraction] = String(value).split('.')
        const digits = [...(fraction ?? '')].map(d => PERSIAN_ONES[Number(d)]).join(' ')
        return `${numberToPersianWords(Number(whole))} ممیز ${digits}`
    }

    if (value < 20) return PERSIAN_ONES[value]

    if (value < 100) {
        const tens = PERSIAN_TENS[Math.floor(value / 10)]
        const rest = value % 10
        return rest ? `${tens} و ${PERSIAN_ONES[rest]}` : tens
    }

    if (value < 1000) {
        const hundreds = PERSIAN_HUNDREDS[Math.floor(value / 100)]
        const rest = value % 100
        return rest ? `${hundreds} و ${numberToPersianWords(rest)}` : hundreds
    }

    for (const [scale, name] of PERSIAN_SCALES) {
        if (value >= scale) {
            const major = `${numberToPersianWords(Math.floor(value / scale))} ${name}`
            const rest = value % scale
            return rest ? `${major} و ${numberToPersianWords(rest)}` : major
        }
    }

    return String(value)
}

/**
 * Parse an English cardinal phrase ("twenty-one", "one hundred and five",
 * "two thousand") into a number. Returns null when the phrase is not a
 * clean cardinal.
 */
export function englishWordsToNumber(phrase: string): number | null {
    const tokens = phrase.toLowerCase().trim().split(/[\s-]+/).filter(Boolean)

    if (!tokens.length) return null

    const consumed = consumeCardinal(tokens, 0)

    if (!consumed || consumed.nextIndex !== tokens.length) return null

    return consumed.value
}

interface CardinalParse {
    value: number
    nextIndex: number
}

/** Greedy cardinal parser over a token array, starting at `index`. */
function consumeCardinal(tokens: string[], index: number): CardinalParse | null {
    let total = 0
    let current = 0
    let i = index
    let matchedAny = false

    while (i < tokens.length) {
        const token = tokens[i]

        if (WORD_VALUES.has(token)) {
            const value = WORD_VALUES.get(token)!

            /* Reject runs that are NOT one cardinal — "one three" (digit
             * reading), "twenty twenty" (year reading), "seventeen five" —
             * conflating those with 13/40/22 would accept wrong values.
             * Only "tens + unit" ("twenty one") merges. */
            if (current > 0 && value >= 10) break
            if (current % 10 !== 0 && value < 10) break
            if (current > 0 && value < 10 && current % 100 < 20 && current % 100 > 0) break

            current += value
            matchedAny = true
            i++
            continue
        }

        if (token === 'hundred' && current > 0 && current < 100) {
            current *= 100
            matchedAny = true
            i++
            continue
        }

        if (SCALE_VALUES.has(token) && token !== 'hundred' && (current > 0 || matchedAny)) {
            total += (current || 1) * SCALE_VALUES.get(token)!
            current = 0
            i++
            continue
        }

        /* "one hundred and five" — allow 'and' only after a hundred/scale
         * part. NOT after small numbers ("five and ten" is a list, not 15). */
        if (
            token === 'and' &&
            matchedAny &&
            (current >= 100 || total > 0) &&
            i + 1 < tokens.length &&
            isNumberWord(tokens[i + 1])
        ) {
            i++
            continue
        }

        break
    }

    if (!matchedAny && total === 0) return null

    return { value: total + current, nextIndex: i }
}

function isNumberWord(token: string): boolean {
    return WORD_VALUES.has(token) || SCALE_VALUES.has(token)
}

const DIGIT_WORDS = new Set(ONES.slice(0, 10))

/**
 * Canonicalize a sentence for number-aware comparison:
 * - lowercase, punctuation stripped (decimal points between digits kept)
 * - thousands separators removed ("1,000" → "1000")
 * - cardinal word phrases → digits ("twenty-one" → "21")
 * - "<number> point <digit words>" → decimal ("five point five zero" → "5.50")
 *
 * Different values can never collide: every phrase maps to its own digits.
 */
export function normalizeNumbersInText(text: string): string {
    let working = text
        .toLowerCase()
        .trim()
        /* thousands separators between digits */
        .replace(/(\d),(?=\d)/g, '$1')
        /* keep dots only between digits (decimals); drop the rest */
        .replace(/(\d)\.(?=\d)/g, '$1§')
        .replace(/[^a-z0-9§\s-]/g, '')
        .replace(/§/g, '.')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')

    const tokens = working.split(' ').filter(Boolean)
    const output: string[] = []

    let i = 0

    while (i < tokens.length) {
        const parsed = isNumberWord(tokens[i]) ? consumeCardinal(tokens, i) : null

        if (parsed) {
            let value = String(parsed.value)
            let next = parsed.nextIndex

            /* decimal continuation: point + single-digit words */
            if (tokens[next] === 'point' && DIGIT_WORDS.has(tokens[next + 1] ?? '')) {
                let fraction = ''
                let j = next + 1

                while (j < tokens.length && DIGIT_WORDS.has(tokens[j])) {
                    fraction += ONES.indexOf(tokens[j])
                    j++
                }

                value += `.${fraction}`
                next = j
            }

            output.push(value)
            i = next
            continue
        }

        output.push(tokens[i])
        i++
    }

    return output.join(' ')
}

export interface NumberAnnotation {
    /** The number as it appears (digits). */
    digits: string
    english: string
    persian: string
    /** How this form is read aloud. */
    reading: 'cardinal' | 'decimal'
}

/**
 * Find numbers in a sentence — digit tokens ("10", "1,000", "25.50") AND
 * written cardinals ("ten", "twenty-one") — for the learning-assistance
 * display. Original text is never modified; this only extracts.
 */
export function annotateNumbers(text: string): NumberAnnotation[] {
    const annotations: NumberAnnotation[] = []
    const seen = new Set<number>()

    function add(value: number, digits: string) {
        if (!Number.isFinite(value) || seen.has(value)) return
        seen.add(value)

        annotations.push({
            digits,
            english: numberToEnglishWords(value),
            persian: numberToPersianWords(value),
            reading: Number.isInteger(value) ? 'cardinal' : 'decimal',
        })
    }

    /* Digit tokens, preserving the original formatting for display. */
    for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
        add(Number(match[0].replace(/,/g, '')), match[0])
    }

    /* Written cardinals (and "<cardinal> point <digits>" decimals). */
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter(Boolean)

    let i = 0

    while (i < tokens.length) {
        const parsed = isNumberWord(tokens[i]) ? consumeCardinal(tokens, i) : null

        if (!parsed) {
            i++
            continue
        }

        let value = parsed.value
        let next = parsed.nextIndex

        if (tokens[next] === 'point' && DIGIT_WORDS.has(tokens[next + 1] ?? '')) {
            let fraction = ''
            let j = next + 1

            while (j < tokens.length && DIGIT_WORDS.has(tokens[j])) {
                fraction += ONES.indexOf(tokens[j])
                j++
            }

            value = Number(`${value}.${fraction}`)
            next = j
        }

        add(value, String(value))
        i = next
    }

    return annotations
}
