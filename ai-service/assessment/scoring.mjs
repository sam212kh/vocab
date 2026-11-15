/**
 * Server-side answer checking. Canonical answers exist ONLY here.
 *
 * Text matching mirrors the frontend practice-mode rules (case/punctuation
 * normalization, 1-edit typo tolerance except grammar-correction, digit
 * guard so tolerance never bridges different numbers). Number-WORD
 * equivalence ("ten" ≡ "10") is intentionally not ported: assessment
 * banks must list such variants explicitly in acceptedAnswers (documented
 * bank-authoring requirement).
 */

function normalize(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/(\d)\.(?=\d)/g, '$1§')
    .replace(/[^a-z0-9§\s-]/g, '')
    .replace(/§/g, '.')
    .replace(/\s+/g, ' ')
}

function levenshtein(a, b) {
  const matrix = []

  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + 1)
    }
  }

  return matrix[b.length][a.length]
}

function digitSequence(value) {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).join(' ')
}

function textMatches(candidate, answer, exact) {
  const normalizedCandidate = normalize(candidate)
  const normalizedAnswer = normalize(answer)

  if (normalizedCandidate === normalizedAnswer) return true
  if (exact) return false
  if (normalizedCandidate.length < 4 || !normalizedAnswer) return false
  if (digitSequence(normalizedCandidate) !== digitSequence(normalizedAnswer)) return false

  return levenshtein(normalizedCandidate, normalizedAnswer) <= 1
}

/**
 * Score a submitted answer against the full (server-side) item.
 * `presentation` carries the server-generated shuffles so ordering/matching
 * answers submitted in DISPLAYED indexes map back to canonical ones.
 * Returns { correct } only — never the canonical answer.
 */
export function scoreAnswer(item, answer, presentation = {}) {
  if (!answer || typeof answer !== 'object') return { correct: false }

  switch (item.type) {
    case 'multiple-choice':
    case 'listening-comprehension':
    case 'reading-comprehension': {
      if (answer.kind !== 'choice' || !Number.isInteger(answer.index)) return { correct: false }
      return { correct: answer.index === item.correctIndex }
    }

    case 'fill-blank':
    case 'translation':
    case 'short-answer':
    case 'dictation':
    case 'grammar-correction': {
      if (answer.kind !== 'text' || typeof answer.text !== 'string') return { correct: false }

      /* exactMatch: bank-level opt-out of typo tolerance for items whose
       * 1-edit neighbours are DIFFERENT real words (e.g. commuter/computer)
       * — tolerance there would score wrong knowledge as correct. */
      const exact = item.type === 'grammar-correction' || item.exactMatch === true

      return {
        correct: item.acceptedAnswers.some(candidate => textMatches(candidate, answer.text, exact)),
      }
    }

    case 'sentence-ordering': {
      if (answer.kind !== 'ordering' || !Array.isArray(answer.order)) return { correct: false }

      /* answer.order = displayed indexes in learner-chosen order; map each
       * displayed index back to the canonical segment index. */
      const map = presentation.segmentOrder

      if (!Array.isArray(map) || answer.order.length !== item.segments.length) return { correct: false }

      const canonicalOrder = answer.order.map(displayedIndex => map[displayedIndex])

      return {
        correct: canonicalOrder.every((segmentIndex, position) => segmentIndex === position),
      }
    }

    case 'matching': {
      if (answer.kind !== 'matching' || !Array.isArray(answer.matches)) return { correct: false }

      const map = presentation.rightOrder

      if (!Array.isArray(map) || answer.matches.length !== item.pairs.length) return { correct: false }

      return {
        correct: answer.matches.every(match =>
          match && Number.isInteger(match.leftIndex) && Number.isInteger(match.rightIndex) &&
          map[match.rightIndex] === match.leftIndex
        ),
      }
    }

    default:
      return { correct: false }
  }
}

/* ------------------------------------------------------------------ */
/* Sanitization                                                        */
/* ------------------------------------------------------------------ */

/** Deterministic seeded shuffle (mulberry32) so presentations are stable per session+item. */
function seededShuffle(length, seedText) {
  let seed = 0

  for (const char of seedText) {
    seed = (seed * 31 + char.codePointAt(0)) >>> 0
  }

  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const indexes = Array.from({ length }, (_, index) => index)

  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[indexes[i], indexes[j]] = [indexes[j], indexes[i]]
  }

  return indexes
}

/**
 * Produce the client-safe view of an item plus the server-kept
 * presentation mapping. NOTHING answer-revealing leaves this function in
 * the `item` half: no acceptedAnswers, no correctIndex, segments/pairs
 * shuffled.
 */
export function sanitizeItem(item, sessionId) {
  const base = {
    id: item.id,
    type: item.type,
    skill: item.skill,
    cefrLevel: item.cefrLevel,
  }

  const presentation = {}

  switch (item.type) {
    case 'multiple-choice':
    case 'listening-comprehension':
    case 'reading-comprehension':
      base.prompt = item.prompt
      base.options = item.options
      if (item.type === 'listening-comprehension') base.audioText = item.audioText
      break

    case 'fill-blank':
      base.before = item.before
      base.after = item.after
      if (item.hint) base.hint = item.hint
      break

    case 'translation':
      base.prompt = item.source
      base.source = item.source
      break

    case 'short-answer':
      base.prompt = item.prompt
      break

    case 'dictation':
      base.audioText = item.audioText
      break

    case 'grammar-correction':
      base.incorrectSentence = item.incorrectSentence
      break

    case 'sentence-ordering': {
      const order = seededShuffle(item.segments.length, `${sessionId}:${item.id}:segments`)
      presentation.segmentOrder = order
      base.segments = order.map(index => item.segments[index])
      break
    }

    case 'matching': {
      const order = seededShuffle(item.pairs.length, `${sessionId}:${item.id}:pairs`)
      presentation.rightOrder = order
      base.pairsLeft = item.pairs.map(pair => pair.left)
      base.pairsRight = order.map(index => item.pairs[index].right)
      break
    }

    default:
      base.prompt = item.prompt ?? ''
  }

  return { item: base, presentation }
}
