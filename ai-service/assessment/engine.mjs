/**
 * Pure assessment algorithms: deterministic adaptive item selection,
 * evidence aggregation, and the transparent CEFR level-ladder estimator.
 *
 * SINGLE SOURCE OF TRUTH: the server runs these authoritatively, and
 * src/services/{assessmentItemSelector,cefrEstimator,assessmentScoring}.ts
 * re-export them (with .d.mts typings) so vitest exercises the same code.
 * No browser or node APIs — pure functions only.
 *
 * This is deliberately NOT item-response theory: items are hand-levelled,
 * the learner population is one person, and implying psychometric
 * calibration would be dishonest. Every rule here is simple, documented
 * and testable.
 */

export const CEFR_LADDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Documented fallback starting level when nothing is self-reported. */
export const DEFAULT_START_LEVEL = 'B1'

export const DEFAULT_ITEM_BUDGET = 18

/** A level needs this many answered items AND distinct types to count. */
export const MIN_ITEMS_PER_LEVEL = 6
export const MIN_TYPES_PER_LEVEL = 2

export const HOLD_ACCURACY = 0.7
export const FAIL_ACCURACY = 0.4

export const MAX_CONFIDENCE = 0.8
export const MIN_CONFIDENCE = 0.2

/* ------------------------------------------------------------------ */
/* Adaptive selection                                                  */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} SelectorState
 * @property {string} currentLevel
 * @property {number} streakCorrect   consecutive correct at currentLevel
 * @property {number} streakWrong     consecutive wrong at currentLevel
 * @property {string[]} administeredIds
 * @property {Array<{itemId:string, level:string, itemType:string, correct:boolean}>} records
 * @property {number} budget
 * @property {string[]} recentExposure  item ids seen in recent past sessions
 */

export function createSelectorState(selfReportedLevel, budget = DEFAULT_ITEM_BUDGET, recentExposure = []) {
  return {
    currentLevel: CEFR_LADDER.includes(selfReportedLevel) ? selfReportedLevel : DEFAULT_START_LEVEL,
    streakCorrect: 0,
    streakWrong: 0,
    administeredIds: [],
    records: [],
    budget,
    recentExposure: [...recentExposure],
  }
}

/** Register an answer and apply the two-in-a-row level stepping. */
export function recordAnswer(state, item, correct) {
  const next = {
    ...state,
    administeredIds: [...state.administeredIds, item.id],
    records: [...state.records, { itemId: item.id, level: item.cefrLevel, itemType: item.type, correct }],
  }

  if (correct) {
    next.streakCorrect = state.streakCorrect + 1
    next.streakWrong = 0
  } else {
    next.streakWrong = state.streakWrong + 1
    next.streakCorrect = 0
  }

  const index = CEFR_LADDER.indexOf(next.currentLevel)

  if (next.streakCorrect >= 2 && index < CEFR_LADDER.length - 1) {
    next.currentLevel = CEFR_LADDER[index + 1]
    next.streakCorrect = 0
    next.streakWrong = 0
  } else if (next.streakWrong >= 2 && index > 0) {
    next.currentLevel = CEFR_LADDER[index - 1]
    next.streakCorrect = 0
    next.streakWrong = 0
  }

  return next
}

/**
 * Pick the next item, or null when the session should end (budget reached
 * or no usable items remain anywhere near the current level).
 *
 * Coverage rule: at the current level, prefer the item TYPE answered least
 * so far. Exposure rule: items seen in recent sessions are avoided, but
 * exposure is a soft constraint — if avoiding them empties the pool, they
 * become eligible again (a repeated question beats no question).
 * Determinism: all ties break by ascending item id.
 */
export function selectNextItem(state, bank) {
  if (state.records.length >= state.budget) return null

  const administered = new Set(state.administeredIds)

  const levelOrder = fallbackLevelOrder(state.currentLevel)

  for (const level of levelOrder) {
    const fresh = bank.filter(
      item => item.cefrLevel === level && !administered.has(item.id) && !state.recentExposure.includes(item.id)
    )

    const pool = fresh.length
      ? fresh
      : bank.filter(item => item.cefrLevel === level && !administered.has(item.id))

    if (!pool.length) continue

    const typeCounts = new Map()

    for (const record of state.records) {
      if (record.level === level) {
        typeCounts.set(record.itemType, (typeCounts.get(record.itemType) ?? 0) + 1)
      }
    }

    const sorted = [...pool].sort((a, b) => {
      const countDiff = (typeCounts.get(a.type) ?? 0) - (typeCounts.get(b.type) ?? 0)
      if (countDiff !== 0) return countDiff
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    return sorted[0]
  }

  return null
}

/** Current level first, then nearest neighbours (down before up at equal distance). */
function fallbackLevelOrder(currentLevel) {
  const index = CEFR_LADDER.indexOf(currentLevel)
  const order = [CEFR_LADDER[index]]

  for (let distance = 1; distance < CEFR_LADDER.length; distance++) {
    if (index - distance >= 0) order.push(CEFR_LADDER[index - distance])
    if (index + distance < CEFR_LADDER.length) order.push(CEFR_LADDER[index + distance])
  }

  return order
}

/* ------------------------------------------------------------------ */
/* Evidence aggregation                                                */
/* ------------------------------------------------------------------ */

/**
 * Build per-level evidence from administered records.
 * Untested and under-sampled levels are explicitly NOT failures.
 */
export function aggregateEvidence(records) {
  return CEFR_LADDER.map(level => {
    const atLevel = records.filter(record => record.level === level)
    const asked = atLevel.length
    const correct = atLevel.filter(record => record.correct).length
    const itemTypes = [...new Set(atLevel.map(record => record.itemType))].sort()
    const accuracy = asked ? correct / asked : 0
    const sufficient = asked >= MIN_ITEMS_PER_LEVEL && itemTypes.length >= MIN_TYPES_PER_LEVEL

    let verdict
    if (asked === 0) verdict = 'untested'
    else if (!sufficient) verdict = 'under-sampled'
    else if (accuracy >= HOLD_ACCURACY) verdict = 'held'
    else if (accuracy < FAIL_ACCURACY) verdict = 'failed'
    else verdict = 'borderline'

    return { level, asked, correct, accuracy, itemTypes, sufficient, verdict }
  })
}

/* ------------------------------------------------------------------ */
/* CEFR ladder estimation                                              */
/* ------------------------------------------------------------------ */

/**
 * Transparent ladder estimate from evidence. Returns
 * { level: string|null, confidence, evidenceQuality, evidence, notes }.
 *
 * Confidence is a bounded, documented heuristic — NOT a statistical
 * interval: base 0.5 for a held level, adjusted for item count, type
 * coverage, and what is known about the level above; clamped to
 * [0.2, 0.8]. Internal estimates never exceed 0.8.
 */
export function estimateLevel(records) {
  const evidence = aggregateEvidence(records)
  const notes = []

  const heldLevels = evidence.filter(entry => entry.verdict === 'held')

  if (!heldLevels.length) {
    const anyFailed = evidence.some(entry => entry.verdict === 'failed')

    if (anyFailed) {
      notes.push('No level was held with sufficient evidence; lower levels were not sufficiently tested.')
    } else {
      notes.push('Not enough evidence at any single level (need 6+ items of 2+ types per level).')
    }

    notes.push('Internal estimate from a self-administered assessment — not a certified CEFR examination.')

    return {
      level: null,
      confidence: MIN_CONFIDENCE,
      evidenceQuality: 'insufficient',
      evidence,
      notes,
    }
  }

  const held = heldLevels[heldLevels.length - 1]
  const heldIndex = CEFR_LADDER.indexOf(held.level)
  const above = heldIndex < CEFR_LADDER.length - 1 ? evidence[heldIndex + 1] : null

  let confidence = 0.5

  if (held.asked >= 9) confidence += 0.1
  if (held.itemTypes.length >= 3) confidence += 0.1

  if (above) {
    if (above.verdict === 'failed') {
      confidence += 0.1
      notes.push(`${above.level} was attempted and not passed — a clear ceiling for this session.`)
    } else if (above.verdict === 'borderline') {
      confidence -= 0.15
      notes.push(`${above.level} results were borderline — the true level may sit between ${held.level} and ${above.level}.`)
    } else if (above.verdict === 'untested' || above.verdict === 'under-sampled') {
      confidence -= 0.1
      notes.push(`${above.level} was not sufficiently tested — the estimate is a floor, not a ceiling.`)
    }
  }

  if (held.accuracy < 0.75) {
    confidence -= 0.1
    notes.push(`Accuracy at ${held.level} was close to the 70% boundary.`)
  }

  confidence = Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, Number(confidence.toFixed(2))))

  const evidenceQuality = qualityFor(held, above)

  notes.push('Internal estimate from a self-administered assessment — not a certified CEFR examination.')

  return {
    level: held.level,
    confidence,
    evidenceQuality,
    evidence,
    notes,
  }
}

function qualityFor(held, above) {
  const aboveInformative = above === null || above.verdict === 'failed' || above.verdict === 'held' || above.verdict === 'borderline'

  if (held.asked >= 12 && held.itemTypes.length >= 3 && aboveInformative) return 'good'
  if (held.asked >= 9 || held.itemTypes.length >= 3) return 'moderate'
  return 'low'
}
