import { EVALUATION_DIMENSIONS, MISTAKE_CATEGORIES } from './prompts.mjs'

/**
 * Request + model-response validation. The model's output is untrusted
 * input: parse defensively, drop unfixable items, coerce recoverable ones,
 * and fail the whole evaluation only when core fields are unusable.
 *
 * Strictness tiers for model output:
 *  - HARD (validation error → repair attempt → evaluation failure):
 *    missing/empty overall, correctedVersion or naturalVersion.
 *  - DROP (item removed, evaluation continues): sentence item whose
 *    "original" does not appear in the submission, duplicate sentence
 *    items, malformed vocabulary/exercise items.
 *  - COERCE: unknown category → "other"; unknown kind → "style" (never
 *    upgrade an unknown judgement to "error").
 */

const FOLLOW_UP_TYPES = new Set(['grammar-correction', 'fill-blank', 'short-answer'])

const LIMITS = {
  sentences: 20,
  vocabulary: 5,
  priorities: 3,
  followUpExercises: 4,
  fieldChars: 2000,
  versionChars: 20000,
}

export function validateEvaluateRequest(body, config) {
  const errors = []

  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const text = typeof body.text === 'string' ? body.text : ''

  if (!text.trim()) errors.push('text is required')
  if ([...text].length > config.maxSubmissionChars) errors.push(`text exceeds ${config.maxSubmissionChars} characters`)

  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) {
    errors.push('provider must be "ollama" or "cloud"')
  }

  if (body.detail !== undefined && !['concise', 'standard', 'detailed'].includes(body.detail)) {
    errors.push('detail must be concise, standard or detailed')
  }

  if (body.explanationLanguage !== undefined && !['english', 'persian', 'bilingual'].includes(body.explanationLanguage)) {
    errors.push('explanationLanguage must be english, persian or bilingual')
  }

  if (errors.length) return { ok: false, errors }

  const learner = body.learner && typeof body.learner === 'object' ? body.learner : {}

  return {
    ok: true,
    value: {
      text,
      task: typeof body.task === 'string' ? body.task.slice(0, 2000) : '',
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
      detail: body.detail ?? 'standard',
      explanationLanguage: body.explanationLanguage ?? 'bilingual',
      learner: {
        nativeLanguage: clip(learner.nativeLanguage, 50),
        selfReportedLevel: clip(learner.selfReportedLevel, 10),
        levelSource: learner.levelSource === 'verified' ? 'verified' : 'self-reported',
        recurringMistakes: Array.isArray(learner.recurringMistakes)
          ? learner.recurringMistakes.filter(item => typeof item === 'string').slice(0, 5)
          : [],
      },
    },
  }
}

function clip(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function str(value, maxChars = LIMITS.fieldChars) {
  return typeof value === 'string' ? value.slice(0, maxChars).trim() : ''
}

function normalizeForMatch(value) {
  return value.toLowerCase().replace(/[.,!?;:'"()‘’“”]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * @returns {{ ok: boolean, evaluation?: object, errors: string[] }}
 */
export function validateEvaluation(raw, submissionText) {
  const errors = []

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const overall = str(raw.overall)
  const correctedVersion = str(raw.correctedVersion, LIMITS.versionChars)
  const naturalVersion = str(raw.naturalVersion, LIMITS.versionChars)

  if (!overall) errors.push('missing "overall" summary')
  if (!correctedVersion) errors.push('missing "correctedVersion"')
  if (!naturalVersion) errors.push('missing "naturalVersion"')

  if (errors.length) return { ok: false, errors }

  const normalizedSubmission = normalizeForMatch(submissionText)

  const seenSentences = new Set()
  const sentences = []
  const droppedReferences = []

  for (const item of Array.isArray(raw.sentences) ? raw.sentences : []) {
    if (sentences.length >= LIMITS.sentences) break
    if (!item || typeof item !== 'object') continue

    const original = str(item.original)
    const corrected = str(item.corrected)
    const explanation = str(item.explanation)

    if (!original || !corrected || !explanation) continue

    /* The quoted sentence must actually exist in the learner's text. */
    if (!normalizedSubmission.includes(normalizeForMatch(original))) {
      droppedReferences.push(original.slice(0, 60))
      continue
    }

    const key = normalizeForMatch(original)
    if (seenSentences.has(key)) continue
    seenSentences.add(key)

    sentences.push({
      original,
      corrected,
      category: MISTAKE_CATEGORIES.includes(item.category) ? item.category : 'other',
      kind: item.kind === 'error' ? 'error' : 'style',
      explanation,
      explanationPersian: str(item.explanationPersian),
      example: str(item.example),
    })
  }

  const dimensions = []
  const seenDimensions = new Set()

  for (const item of Array.isArray(raw.dimensions) ? raw.dimensions : []) {
    if (!item || typeof item !== 'object') continue
    if (!EVALUATION_DIMENSIONS.includes(item.dimension)) continue
    if (seenDimensions.has(item.dimension)) continue

    const assessment = str(item.assessment)
    if (!assessment) continue

    seenDimensions.add(item.dimension)
    dimensions.push({
      dimension: item.dimension,
      assessment,
      evidence: str(item.evidence),
      suggestion: str(item.suggestion),
    })
  }

  const vocabulary = (Array.isArray(raw.vocabulary) ? raw.vocabulary : [])
    .filter(item => item && typeof item === 'object' && str(item.original) && str(item.suggestion))
    .slice(0, LIMITS.vocabulary)
    .map(item => ({
      original: str(item.original),
      suggestion: str(item.suggestion),
      reason: str(item.reason),
      kind: item.kind === 'error' ? 'error' : 'style',
    }))

  const priorities = (Array.isArray(raw.priorities) ? raw.priorities : [])
    .filter(item => typeof item === 'string' && item.trim())
    .slice(0, LIMITS.priorities)
    .map(item => item.slice(0, 300))

  const followUpExercises = (Array.isArray(raw.followUpExercises) ? raw.followUpExercises : [])
    .filter(item =>
      item &&
      typeof item === 'object' &&
      FOLLOW_UP_TYPES.has(item.type) &&
      str(item.prompt) &&
      Array.isArray(item.acceptedAnswers) &&
      item.acceptedAnswers.some(answer => typeof answer === 'string' && answer.trim())
    )
    .slice(0, LIMITS.followUpExercises)
    .map(item => ({
      type: item.type,
      prompt: str(item.prompt),
      acceptedAnswers: item.acceptedAnswers.filter(a => typeof a === 'string' && a.trim()).map(a => a.slice(0, 500)),
      explanation: str(item.explanation),
    }))

  return {
    ok: true,
    errors: droppedReferences.length
      ? [`dropped ${droppedReferences.length} sentence item(s) not found in the submission`]
      : [],
    evaluation: {
      overall,
      correctedVersion,
      naturalVersion,
      dimensions,
      sentences,
      vocabulary,
      priorities,
      followUpExercises,
    },
  }
}

/** Strip common markdown fences and extract the outermost JSON object. */
export function extractJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')

    if (start === -1 || end <= start) return null

    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}
