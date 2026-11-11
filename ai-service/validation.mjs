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

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

const CONVERSATION_MODES = ['free', 'daily-life', 'professional', 'interview', 'workplace', 'technical', 'travel', 'roleplay']

const FEEDBACK_MODES = ['natural', 'gentle', 'teacher']

const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const MAX_MESSAGES = 16

const MAX_MESSAGE_CHARS = 2000

export function validateChatRequest(body, config) {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const errors = []

  const rawMessages = Array.isArray(body.messages) ? body.messages : null

  if (!rawMessages || !rawMessages.length) errors.push('messages is required')

  if (body.mode !== undefined && !CONVERSATION_MODES.includes(body.mode)) errors.push('invalid mode')
  if (body.feedbackMode !== undefined && !FEEDBACK_MODES.includes(body.feedbackMode)) errors.push('invalid feedbackMode')
  if (body.difficulty !== undefined && !DIFFICULTIES.includes(body.difficulty)) errors.push('invalid difficulty')
  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) errors.push('provider must be "ollama" or "cloud"')
  if (body.explanationLanguage !== undefined && !['english', 'persian', 'bilingual'].includes(body.explanationLanguage)) {
    errors.push('explanationLanguage must be english, persian or bilingual')
  }

  const messages = (rawMessages ?? [])
    .filter(item => item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim())
    .map(item => ({
      role: item.role === 'learner' ? 'learner' : 'tutor',
      text: item.text.slice(0, MAX_MESSAGE_CHARS),
    }))
    /* Bounded context window: only the most recent turns reach the model. */
    .slice(-MAX_MESSAGES)

  if (!errors.length && !messages.length) errors.push('messages contained no usable entries')

  if (!errors.length && messages[messages.length - 1].role !== 'learner') {
    errors.push('the last message must be from the learner')
  }

  const totalChars = messages.reduce((sum, message) => sum + message.text.length, 0)
  if (totalChars > config.maxSubmissionChars * 2) errors.push('conversation context is too large')

  if (errors.length) return { ok: false, errors }

  const learner = body.learner && typeof body.learner === 'object' ? body.learner : {}
  const scenario = body.scenario && typeof body.scenario === 'object' ? body.scenario : null

  return {
    ok: true,
    value: {
      messages,
      mode: body.mode ?? 'free',
      feedbackMode: body.feedbackMode ?? 'gentle',
      difficulty: body.difficulty ?? 'B1',
      explanationLanguage: body.explanationLanguage ?? 'bilingual',
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
      scenario: scenario
        ? {
            title: clip(scenario.title, 200),
            aiRole: clip(scenario.aiRole, 300),
            learnerRole: clip(scenario.learnerRole, 300),
            objective: clip(scenario.objective, 500),
            context: clip(scenario.context, 1000),
            vocabulary: Array.isArray(scenario.vocabulary)
              ? scenario.vocabulary.filter(item => typeof item === 'string').slice(0, 10)
              : [],
          }
        : null,
      learner: {
        nativeLanguage: clip(learner.nativeLanguage, 50),
        interests: Array.isArray(learner.interests)
          ? learner.interests.filter(item => typeof item === 'string').slice(0, 5)
          : [],
        goals: Array.isArray(learner.goals)
          ? learner.goals.filter(item => typeof item === 'string').slice(0, 4)
          : [],
        recurringMistakes: Array.isArray(learner.recurringMistakes)
          ? learner.recurringMistakes.filter(item => typeof item === 'string').slice(0, 5)
          : [],
      },
    },
  }
}

const FEEDBACK_MODE_CORRECTION_LIMITS = { natural: 0, gentle: 2, teacher: 5 }

/**
 * Validate a chat model response. "reply" is hard-required. Corrections are
 * trusted even less than in writing evaluation: they must quote the
 * learner's LAST message, and the feedback-mode contract is enforced
 * server-side (natural mode strips everything, gentle keeps only errors).
 */
export function validateChatResponse(raw, lastLearnerMessage, feedbackMode) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const reply = str(raw.reply, 4000)

  if (!reply) return { ok: false, errors: ['missing "reply"'] }

  const limit = FEEDBACK_MODE_CORRECTION_LIMITS[feedbackMode] ?? 2
  const normalizedMessage = normalizeForMatch(lastLearnerMessage)
  const seen = new Set()
  const corrections = []
  const warnings = []

  for (const item of Array.isArray(raw.corrections) ? raw.corrections : []) {
    if (corrections.length >= limit) break
    if (!item || typeof item !== 'object') continue

    const original = str(item.original, 500)
    const corrected = str(item.corrected, 500)
    const explanation = str(item.explanation, 1000)

    if (!original || !corrected || !explanation) continue

    if (!normalizedMessage.includes(normalizeForMatch(original))) {
      warnings.push('dropped a correction not quoting the learner message')
      continue
    }

    const kind = item.kind === 'error' ? 'error' : 'style'

    /* Gentle mode: important errors only, never style nits. */
    if (feedbackMode === 'gentle' && kind !== 'error') continue

    const key = normalizeForMatch(original)
    if (seen.has(key)) continue
    seen.add(key)

    corrections.push({
      original,
      corrected,
      natural: str(item.natural, 500),
      category: MISTAKE_CATEGORIES.includes(item.category) ? item.category : 'other',
      kind,
      explanation,
      explanationPersian: str(item.explanationPersian, 1000),
      example: str(item.example, 500),
    })
  }

  return { ok: true, errors: warnings, value: { reply, corrections } }
}

export function validateSummaryResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const overall = str(raw.overall, 2000)

  if (!overall) return { ok: false, errors: ['missing "overall"'] }

  const strings = (value, limit, chars = 300) =>
    (Array.isArray(value) ? value : [])
      .filter(item => typeof item === 'string' && item.trim())
      .slice(0, limit)
      .map(item => item.slice(0, chars))

  const corrections = (Array.isArray(raw.corrections) ? raw.corrections : [])
    .filter(item => item && typeof item === 'object' && str(item.original) && str(item.corrected))
    .slice(0, 5)
    .map(item => ({
      original: str(item.original, 500),
      corrected: str(item.corrected, 500),
      category: MISTAKE_CATEGORIES.includes(item.category) ? item.category : 'other',
      kind: item.kind === 'error' ? 'error' : 'style',
      explanation: str(item.explanation, 1000),
      explanationPersian: str(item.explanationPersian, 1000),
    }))

  const usefulExpressions = (Array.isArray(raw.usefulExpressions) ? raw.usefulExpressions : [])
    .filter(item => item && typeof item === 'object' && str(item.expression))
    .slice(0, 5)
    .map(item => ({
      expression: str(item.expression, 300),
      meaning: str(item.meaning, 500),
      meaningPersian: str(item.meaningPersian, 500),
    }))

  return {
    ok: true,
    errors: [],
    value: {
      overall,
      strengths: strings(raw.strengths, 3),
      improvements: strings(raw.improvements, 3),
      corrections,
      usefulExpressions,
      suggestedNextActivity: str(raw.suggestedNextActivity, 300),
    },
  }
}

const ASSIST_KINDS = ['translate', 'explain', 'simplify', 'correct']

export function validateAssistRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const errors = []

  if (!ASSIST_KINDS.includes(body.kind)) errors.push('invalid kind')

  const text = typeof body.text === 'string' ? body.text.trim() : ''

  if (!text) errors.push('text is required')
  if (text.length > 2000) errors.push('text exceeds 2000 characters')
  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) errors.push('provider must be "ollama" or "cloud"')

  if (errors.length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      kind: body.kind,
      text,
      explanationLanguage: ['english', 'persian', 'bilingual'].includes(body.explanationLanguage)
        ? body.explanationLanguage
        : 'bilingual',
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
    },
  }
}

export function validateAssistResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const reply = str(raw.reply, 3000)

  if (!reply) return { ok: false, errors: ['missing "reply"'] }

  return { ok: true, errors: [], value: { reply } }
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
