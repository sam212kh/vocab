import { EVALUATION_DIMENSIONS, MISTAKE_CATEGORIES, SENTENCE_DIMENSIONS } from './prompts.mjs'

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

const INTERVIEW_DIMENSIONS = ['grammar', 'vocabulary', 'fluency', 'naturalness', 'clarity', 'relevance', 'structure', 'professional-tone']

export function validateInterviewAnswerRequest(body, config) {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''

  const errors = []

  if (!question) errors.push('question is required')
  if (question.length > 500) errors.push('question exceeds 500 characters')
  if (!answer) errors.push('answer is required')
  if ([...answer].length > config.maxSubmissionChars) errors.push(`answer exceeds ${config.maxSubmissionChars} characters`)
  if (body.answerMode !== undefined && !['text', 'voice'].includes(body.answerMode)) errors.push('answerMode must be text or voice')
  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) errors.push('provider must be "ollama" or "cloud"')

  if (errors.length) return { ok: false, errors }

  const learner = body.learner && typeof body.learner === 'object' ? body.learner : {}

  return {
    ok: true,
    value: {
      question,
      answer,
      answerMode: body.answerMode ?? 'text',
      explanationLanguage: ['english', 'persian', 'bilingual'].includes(body.explanationLanguage) ? body.explanationLanguage : 'bilingual',
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
      learner: { selfReportedLevel: clip(learner.selfReportedLevel, 10) },
    },
  }
}

/**
 * Interview answer validation. Language vs content separation is enforced:
 * every dimension carries a kind; unknown kinds are derived from the
 * dimension name (never trusted blindly).
 */
export function validateInterviewAnswerResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const overall = str(raw.overall, 2000)
  const correctedAnswer = str(raw.correctedAnswer, 8000)
  const professionalVersion = str(raw.professionalVersion, 8000)

  const errors = []
  if (!overall) errors.push('missing "overall"')
  if (!correctedAnswer) errors.push('missing "correctedAnswer"')
  if (!professionalVersion) errors.push('missing "professionalVersion"')
  if (errors.length) return { ok: false, errors }

  const CONTENT_DIMENSIONS = new Set(['relevance', 'structure'])

  const seen = new Set()
  const dimensions = []

  for (const item of Array.isArray(raw.dimensions) ? raw.dimensions : []) {
    if (!item || typeof item !== 'object') continue
    if (!INTERVIEW_DIMENSIONS.includes(item.dimension) || seen.has(item.dimension)) continue
    if (!str(item.assessment)) continue

    seen.add(item.dimension)
    dimensions.push({
      dimension: item.dimension,
      /* kind derived from the dimension itself — the model cannot relabel
       * a content weakness as a language mistake or vice versa. */
      kind: CONTENT_DIMENSIONS.has(item.dimension) ? 'content' : 'language',
      assessment: str(item.assessment, 600),
      suggestion: str(item.suggestion, 600),
    })
  }

  const languageIssues = (Array.isArray(raw.languageIssues) ? raw.languageIssues : [])
    .filter(item => item && typeof item === 'object' && str(item.original) && str(item.corrected) && str(item.explanation))
    .slice(0, 10)
    .map(item => ({
      original: str(item.original, 500),
      corrected: str(item.corrected, 500),
      category: MISTAKE_CATEGORIES.includes(item.category) ? item.category : 'other',
      explanation: str(item.explanation, 800),
      explanationPersian: str(item.explanationPersian, 800),
    }))

  const alternativeExpressions = (Array.isArray(raw.alternativeExpressions) ? raw.alternativeExpressions : [])
    .filter(item => item && typeof item === 'object' && str(item.instead_of) && str(item.try))
    .slice(0, 4)
    .map(item => ({ insteadOf: str(item.instead_of, 200), try: str(item.try, 200) }))

  const strings = (value, limit) =>
    (Array.isArray(value) ? value : [])
      .filter(item => typeof item === 'string' && item.trim())
      .slice(0, limit)
      .map(item => item.slice(0, 400))

  return {
    ok: true,
    errors: [],
    value: {
      overall,
      correctedAnswer,
      professionalVersion,
      dimensions,
      languageIssues,
      alternativeExpressions,
      contentSuggestions: strings(raw.contentSuggestions, 3),
      followUpPractice: strings(raw.followUpPractice, 2),
    },
  }
}

export function validateExpressRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const input = typeof body.input === 'string' ? body.input.trim() : ''

  const errors = []

  if (!input) errors.push('input is required')
  if (input.length > 500) errors.push('input exceeds 500 characters')
  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) errors.push('provider must be "ollama" or "cloud"')

  if (errors.length) return { ok: false, errors }

  const learner = body.learner && typeof body.learner === 'object' ? body.learner : {}

  return {
    ok: true,
    value: {
      input,
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
      learner: { selfReportedLevel: clip(learner.selfReportedLevel, 10) },
    },
  }
}

const EXPRESS_EXERCISE_TYPES = new Set(['grammar-correction', 'fill-blank', 'short-answer'])

export function validateExpressResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const literal = str(raw.literal, 500)
  const natural = str(raw.natural, 500)
  const naturalPersian = str(raw.naturalPersian, 500)

  const errors = []
  if (!natural) errors.push('missing "natural"')
  if (!naturalPersian) errors.push('missing "naturalPersian"')

  if (errors.length) return { ok: false, errors }

  const pairList = (value, limit) =>
    (Array.isArray(value) ? value : [])
      .filter(item => item && typeof item === 'object' && str(item.english) && str(item.persian))
      .slice(0, limit)
      .map(item => ({ english: str(item.english, 300), persian: str(item.persian, 300) }))

  const followUpExercises = (Array.isArray(raw.followUpExercises) ? raw.followUpExercises : [])
    .filter(item =>
      item && typeof item === 'object' &&
      EXPRESS_EXERCISE_TYPES.has(item.type) &&
      str(item.prompt) &&
      Array.isArray(item.acceptedAnswers) &&
      item.acceptedAnswers.some(answer => typeof answer === 'string' && answer.trim())
    )
    .slice(0, 2)
    .map(item => ({
      type: item.type,
      prompt: str(item.prompt, 500),
      acceptedAnswers: item.acceptedAnswers.filter(a => typeof a === 'string' && a.trim()).map(a => a.slice(0, 300)),
      explanation: str(item.explanation, 500),
    }))

  return {
    ok: true,
    errors: [],
    value: {
      literal,
      natural,
      naturalPersian,
      advanced: str(raw.advanced, 500),
      advancedPersian: str(raw.advancedPersian, 500),
      vocabulary: pairList(raw.vocabulary, 4),
      relatedExamples: pairList(raw.relatedExamples, 3),
      followUpExercises,
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

/* ------------------------------------------------------------------ */
/* Sentence production evaluation                                      */
/* ------------------------------------------------------------------ */

export const SENTENCE_SCHEMA_VERSION = 'sentence-evaluation-v1'

const SENTENCE_LIMITS = { sentenceChars: 600, targets: 5, references: 5, field: 300 }

const DIMENSION_STATUSES = ['ok', 'minor', 'problem', 'not-applicable']

/* Dimensions whose errors point at a concrete, verifiable fragment. */
const FRAGMENT_REQUIRED = new Set(['grammar', 'vocabulary', 'wordOrder'])

function normSentence(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word match of an expression, tolerating simple inflection (put → puts/putting). */
export function usesExpression(sentence, expression) {
  const tokens = normSentence(expression).split(' ').filter(Boolean)
  if (!tokens.length) return false

  const pattern = tokens
    .map(token => `(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?:s|es|ed|d|ing)?(?![\\p{L}\\p{N}])`)
    .join('\\s+')

  return new RegExp(pattern, 'u').test(normSentence(sentence))
}

function dice(a, b) {
  const left = new Set(normSentence(a).split(' ').filter(Boolean))
  const right = new Set(normSentence(b).split(' ').filter(Boolean))
  if (!left.size || !right.size) return 0

  let shared = 0
  for (const word of left) if (right.has(word)) shared++

  return (2 * shared) / (left.size + right.size)
}

function stringList(value, limit, maxChars) {
  return (Array.isArray(value) ? value : [])
    .filter(item => typeof item === 'string' && item.trim())
    .slice(0, limit)
    .map(item => item.trim().slice(0, maxChars))
}

export function validateSentenceEvaluationRequest(body, config) {
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: ['Body must be a JSON object'] }
  }

  const learnerSentence = typeof body.learnerSentence === 'string' ? body.learnerSentence.trim() : ''
  const promptPersian = str(body.promptPersian, 500)
  const promptEnglish = str(body.promptEnglish, 500)
  const situation = str(body.situation, 300)

  const errors = []

  if (!learnerSentence) errors.push('learnerSentence is required')
  if ([...learnerSentence].length > Math.min(SENTENCE_LIMITS.sentenceChars, config.maxSubmissionChars)) {
    errors.push(`learnerSentence exceeds ${SENTENCE_LIMITS.sentenceChars} characters`)
  }
  if (!promptPersian && !promptEnglish && !situation) errors.push('a task (promptPersian, promptEnglish or situation) is required')
  if (body.taskType !== undefined && !['open', 'translate'].includes(body.taskType)) errors.push('taskType must be open or translate')
  if (body.provider !== undefined && !['ollama', 'cloud'].includes(body.provider)) errors.push('provider must be "ollama" or "cloud"')

  if (errors.length) return { ok: false, errors }

  const learner = body.learner && typeof body.learner === 'object' ? body.learner : {}

  return {
    ok: true,
    value: {
      learnerSentence,
      taskType: body.taskType ?? 'open',
      promptPersian,
      promptEnglish,
      situation,
      targetExpressions: stringList(body.targetExpressions, SENTENCE_LIMITS.targets, 100),
      referenceSentences: stringList(body.referenceSentences, SENTENCE_LIMITS.references, 300),
      explanationLanguage: ['english', 'persian', 'bilingual'].includes(body.explanationLanguage) ? body.explanationLanguage : 'bilingual',
      provider: body.provider,
      model: typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined,
      learner: { selfReportedLevel: clip(learner.selfReportedLevel, 10) },
    },
  }
}

/**
 * The model reports per-dimension statuses and concrete errors; EVERYTHING
 * decision-like (outcome, issues, language/content split, whether the
 * target was used, matches-reference) is derived here, so the model cannot
 * assert a verdict that contradicts its own dimensions, invent an error that
 * is not in the learner's text, or skip a verifiable fact.
 *
 * @param raw   parsed model output (untrusted)
 * @param ctx   { learnerSentence, targetExpressions, referenceSentences }
 */
export function validateSentenceEvaluationResponse(raw, ctx) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['response is not a JSON object'] }
  }

  const warnings = []
  const errors = []
  const sentence = ctx.learnerSentence

  if (typeof raw.complete !== 'boolean') errors.push('"complete" must be a boolean')

  const rawDimensions = raw.dimensions && typeof raw.dimensions === 'object' ? raw.dimensions : {}
  const dimensions = {}

  for (const key of SENTENCE_DIMENSIONS) {
    const item = rawDimensions[key]

    if (!item || typeof item !== 'object' || !DIMENSION_STATUSES.includes(item.status)) {
      errors.push(`dimensions.${key}.status must be one of ${DIMENSION_STATUSES.join(', ')}`)
      continue
    }

    dimensions[key] = { status: item.status, note: str(item.note, SENTENCE_LIMITS.field) }
  }

  if (errors.length) return { ok: false, errors }

  /* ---- errors: keep only verifiable, dimension-consistent ones ---- */
  const normalizedSentence = ` ${normSentence(sentence)} `
  const seen = new Set()
  const verified = []

  for (const item of Array.isArray(raw.errors) ? raw.errors : []) {
    if (!item || typeof item !== 'object') continue
    if (!SENTENCE_DIMENSIONS.includes(item.dimension)) continue

    const explanation = str(item.explanation, 400)
    if (!explanation) continue

    const fragment = str(item.fragment, 200)

    if (fragment) {
      if (!normalizedSentence.includes(` ${normSentence(fragment)} `)) {
        warnings.push(`dropped error: fragment "${fragment.slice(0, 40)}" is not in the learner's sentence`)
        continue
      }
    } else if (FRAGMENT_REQUIRED.has(item.dimension)) {
      warnings.push(`dropped ${item.dimension} error without a fragment`)
      continue
    }

    if (dimensions[item.dimension].status === 'ok' || dimensions[item.dimension].status === 'not-applicable') {
      warnings.push(`dropped ${item.dimension} error: that dimension was reported as ${dimensions[item.dimension].status}`)
      continue
    }

    const key = `${item.dimension}:${normSentence(fragment)}`
    if (seen.has(key)) continue
    seen.add(key)

    const index = fragment ? sentence.toLowerCase().indexOf(fragment.toLowerCase()) : -1

    verified.push({
      dimension: item.dimension,
      fragment,
      start: index >= 0 ? index : null,
      end: index >= 0 ? index + fragment.length : null,
      explanation,
      explanationPersian: str(item.explanationPersian, 400),
      suggestion: str(item.suggestion, 200),
    })
  }

  const errorsList = verified.slice(0, 6)

  /* ---- a "problem" must be backed by a verified error, else it is only "minor" ---- */
  for (const key of SENTENCE_DIMENSIONS) {
    if (dimensions[key].status === 'problem' && !errorsList.some(error => error.dimension === key)) {
      dimensions[key].status = 'minor'
      warnings.push(`${key}: "problem" had no verifiable supporting error — downgraded to "minor"`)
    }
  }

  /* ---- target use is verified deterministically and is never an error ---- */
  const targets = ctx.targetExpressions ?? []
  const usedTargets = targets.filter(target => usesExpression(sentence, target))

  if (!targets.length) {
    dimensions.targetExpression = { status: 'not-applicable', note: '' }
  } else {
    if (!usedTargets.length && dimensions.targetExpression.status === 'ok') {
      dimensions.targetExpression.status = 'minor'
      if (!dimensions.targetExpression.note) dimensions.targetExpression.note = `Target not used: ${targets.join(', ')}`
    }
    if (dimensions.targetExpression.status === 'problem') dimensions.targetExpression.status = 'minor'
  }

  /* ---- derived decision ---- */
  const status = key => dimensions[key].status
  const issues = []

  if (raw.complete === false) issues.push('incomplete')
  if (status('meaning') === 'problem') issues.push('meaning')
  if (status('contextRelevance') === 'problem') issues.push('off-topic')
  if (status('grammar') === 'problem') issues.push('grammar')
  if (status('wordOrder') === 'problem') issues.push('word-order')
  if (status('vocabulary') === 'problem') issues.push('vocabulary')
  if (status('naturalness') === 'problem') issues.push('unnatural')

  const matchesReference = (ctx.referenceSentences ?? []).some(
    reference => normSentence(reference) === normSentence(sentence)
  )

  let outcome

  if (issues.includes('incomplete')) outcome = 'incomplete'
  else if (issues.includes('meaning')) outcome = 'meaning-changed'
  else if (issues.includes('off-topic')) outcome = 'off-topic'
  else if (issues.some(issue => ['grammar', 'word-order', 'vocabulary'].includes(issue))) outcome = 'needs-correction'
  else if (issues.includes('unnatural')) outcome = 'unnatural'
  else outcome = matchesReference ? 'correct' : 'valid-alternative'

  /* Language correctness and content quality are reported separately. */
  const language = {
    correct: !['grammar', 'wordOrder', 'vocabulary'].some(key => status(key) === 'problem'),
    natural: status('naturalness') !== 'problem',
  }
  const content = {
    complete: raw.complete !== false,
    meaningPreserved: status('meaning') !== 'problem',
    relevant: status('contextRelevance') !== 'problem',
    targetUsed: targets.length ? usedTargets.length > 0 : null,
    usedTargets,
  }

  /* "Passed" = a complete, relevant, meaning-preserving, language-correct
   * sentence. Unnaturalness alone is feedback, not a failure. */
  const passed = outcome === 'correct' || outcome === 'valid-alternative' || outcome === 'unnatural'

  /* ---- corrected sentence ---- */
  const needsFix = outcome !== 'correct' && outcome !== 'valid-alternative' && outcome !== 'incomplete'
  let correctedSentence = needsFix ? str(raw.correctedSentence, 400) : ''
  const unchanged = normSentence(correctedSentence) === normSentence(sentence)

  if (needsFix && (!correctedSentence || unchanged)) {
    errors.push('"correctedSentence" is required and must differ from the learner sentence when a problem is reported')
  }

  /* A correction that only fixes language must not rewrite the learner's idea. */
  if (
    correctedSentence &&
    outcome === 'needs-correction' &&
    dice(correctedSentence, sentence) < 0.4
  ) {
    errors.push('"correctedSentence" rewrites the learner\'s sentence instead of fixing it; keep the learner\'s own content')
  }

  if (errors.length) return { ok: false, errors }

  const explanationPersian = str(raw.explanationPersian, 600)
  if (needsFix && !explanationPersian && !errorsList.some(error => error.explanationPersian)) {
    warnings.push('no Persian explanation supplied')
  }

  const alternatives = stringList(raw.alternatives, 3, 200).filter(
    item => normSentence(item) !== normSentence(sentence)
  )

  return {
    ok: true,
    errors: warnings,
    value: {
      schemaVersion: SENTENCE_SCHEMA_VERSION,
      learnerSentence: sentence,
      outcome,
      passed,
      issues,
      language,
      content,
      matchesReference,
      dimensions,
      errors: errorsList,
      correctedSentence,
      explanationPersian,
      alternatives,
      example: str(raw.example, 200),
      nextPractice: str(raw.nextPractice, 200),
    },
  }
}
