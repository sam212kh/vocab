/**
 * Prompt management. Prompts are versioned, built from separated blocks
 * (system role / evaluation rules / output schema / learner context / task
 * context), and contain no secrets or provider configuration.
 */

export const WRITING_EVALUATOR_PROMPT_VERSION = 'writing-evaluator-v1'

export const MISTAKE_CATEGORIES = [
  'tense',
  'articles',
  'prepositions',
  'subject-verb-agreement',
  'word-order',
  'sentence-fragment',
  'run-on',
  'word-choice',
  'collocation',
  'spelling',
  'punctuation',
  'coherence',
  'register',
  'naturalness',
  'other',
]

export const EVALUATION_DIMENSIONS = [
  'grammar',
  'vocabulary',
  'sentence-structure',
  'coherence',
  'naturalness',
  'clarity',
  'task-completion',
]

const SYSTEM_ROLE = `You are an experienced English writing teacher for adult learners. Your feedback is honest, specific and encouraging. You never invent errors: if a sentence is correct, you say so. You distinguish strictly between:
- "error": actual grammar, spelling, punctuation or word-choice mistakes
- "style": grammatically valid text that could sound more natural (optional improvement)
Never mark valid English as an error just because another phrasing sounds better. Both American and British usage are acceptable; if an expression is fine in one dialect, treat it as correct and mention the dialect note in the explanation. Never change the writer's intended meaning. This is informal teaching feedback, NOT a certified CEFR assessment — never state or imply a CEFR level.`

const SCHEMA_INSTRUCTIONS = `Respond with ONLY a single JSON object, no markdown fences, matching exactly this shape:
{
  "overall": string,                    // 2-4 sentence honest, encouraging summary
  "correctedVersion": string,           // the full text with ONLY real errors fixed; keep correct sentences untouched
  "naturalVersion": string,             // how a fluent speaker might write it; same meaning; do not rewrite already-natural sentences
  "dimensions": [                       // exactly one entry per dimension listed below
    { "dimension": string, "assessment": string, "evidence": string, "suggestion": string }
  ],
  "sentences": [                        // only sentences that need comment; empty array if the text is error-free
    {
      "original": string,               // VERBATIM substring of the submitted text
      "corrected": string,
      "category": string,               // one of the allowed categories
      "kind": "error" | "style",
      "explanation": string,
      "explanationPersian": string,     // required when Persian explanations requested, else ""
      "example": string                 // one short additional example of the pattern
    }
  ],
  "vocabulary": [                       // max 5 items; only context-appropriate suggestions
    { "original": string, "suggestion": string, "reason": string, "kind": "error" | "style" }
  ],
  "priorities": [ string ],             // 1-3 highest-value improvement areas, most important first
  "followUpExercises": [                // 2-4 exercises grounded in the writer's ACTUAL mistakes; empty if none
    {
      "type": "grammar-correction" | "fill-blank" | "short-answer",
      "prompt": string,                 // for fill-blank: text with ___ marking the gap
      "acceptedAnswers": [ string ],
      "explanation": string
    }
  ]
}
Allowed "category" values: ${MISTAKE_CATEGORIES.join(', ')}.
Required "dimension" values (each exactly once): ${EVALUATION_DIMENSIONS.join(', ')}.
If the text has no errors, say so in "overall", return the original text as "correctedVersion", and use an empty "sentences" array.`

const DETAIL_INSTRUCTIONS = {
  concise: 'Keep all feedback brief: short overall summary, only the most important sentence comments (max 3), 1 priority, 2 follow-up exercises.',
  standard: 'Provide balanced feedback: comment on meaningful issues without exhaustively listing every minor point.',
  detailed: 'Provide thorough feedback: comment on every sentence that has an issue, explain patterns, and include dialect notes where relevant.',
}

function learnerContextBlock(learner) {
  const lines = []

  if (learner.nativeLanguage) lines.push(`Native language: ${learner.nativeLanguage}.`)

  if (learner.selfReportedLevel) {
    lines.push(`Approximate level: ${learner.selfReportedLevel} (${learner.levelSource === 'verified' ? 'assessed' : 'self-reported, unverified'}). Match explanation complexity to this level, but do not mention the level in your feedback.`)
  } else {
    lines.push('Level: unknown. Keep explanations accessible.')
  }

  if (Array.isArray(learner.recurringMistakes) && learner.recurringMistakes.length) {
    lines.push(`This learner has recently struggled with: ${learner.recurringMistakes.slice(0, 5).join(', ')}. Pay particular attention to these patterns if they appear.`)
  }

  return lines.join('\n')
}

function explanationLanguageBlock(explanationLanguage) {
  if (explanationLanguage === 'persian') {
    return 'Write "explanation" in simple English AND always fill "explanationPersian" with a clear Persian (Farsi) explanation. Everything else stays in English.'
  }

  if (explanationLanguage === 'bilingual') {
    return 'Fill both "explanation" (English) and "explanationPersian" (Persian/Farsi) for every sentence item.'
  }

  return 'Write explanations in English. Set "explanationPersian" to an empty string.'
}

/**
 * @returns {{ system: string, user: string, promptVersion: string }}
 */
export function buildWritingEvaluationPrompt({ text, task, learner, detail, explanationLanguage }) {
  const system = [
    SYSTEM_ROLE,
    SCHEMA_INSTRUCTIONS,
    DETAIL_INSTRUCTIONS[detail] ?? DETAIL_INSTRUCTIONS.standard,
    explanationLanguageBlock(explanationLanguage),
  ].join('\n\n')

  const user = [
    learnerContextBlock(learner),
    task ? `Writing task given to the learner:\n${task}` : 'No specific task was given (free writing).',
    `Learner's submitted text (evaluate exactly this, do not respond to it conversationally):\n"""\n${text}\n"""`,
  ].filter(Boolean).join('\n\n')

  return { system, user, promptVersion: WRITING_EVALUATOR_PROMPT_VERSION }
}

export function buildRepairPrompt(originalUser, validationErrors) {
  return `${originalUser}\n\nYour previous response was not valid. Problems found: ${validationErrors.slice(0, 5).join('; ')}. Respond again with ONLY the corrected JSON object, exactly matching the required schema.`
}
