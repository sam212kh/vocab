import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.AI_HOST = '127.0.0.1'
process.env.AI_SERVICE_PORT = '0'
process.env.AI_ALLOWED_ORIGINS = 'http://localhost:5173'
process.env.AI_PROVIDER = 'ollama'
process.env.AI_FALLBACK_PROVIDER = 'cloud'
process.env.AI_RATE_LIMIT_PER_MINUTE = '100'
process.env.AI_MAX_BODY_BYTES = '65536'
process.env.AI_MAX_SUBMISSION_CHARS = '8000'
process.env.AI_MAX_REPAIR_ATTEMPTS = '1'

const { server } = await import('./server.mjs')

await new Promise(resolve => (server.listening ? resolve() : server.once('listening', resolve)))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

after(() => server.close())

beforeEach(() => {
  delete process.env.AI_TEST_FAILURE
  delete process.env.AI_TEST_FAILURE_PROVIDER
  delete process.env.AI_TEST_RESPONSE
  delete process.env.AI_TEST_CLOUD_RESPONSE
  delete process.env.AI_TEST_DELAY_MS
})

const SUBMISSION = 'Yesterday I have seen a interesting film. It was really good experience.'

const VALID_EVALUATION = {
  overall: 'A clear short text with two common mistakes worth fixing.',
  correctedVersion: 'Yesterday I saw an interesting film. It was a really good experience.',
  naturalVersion: 'I saw a really interesting film yesterday — I had a great time.',
  dimensions: [
    { dimension: 'grammar', assessment: 'Two tense/article slips.', evidence: 'I have seen / a interesting', suggestion: 'Review past simple with finished time.' },
    { dimension: 'vocabulary', assessment: 'Appropriate for the task.', evidence: '', suggestion: '' },
  ],
  sentences: [
    {
      original: 'Yesterday I have seen a interesting film.',
      corrected: 'Yesterday I saw an interesting film.',
      category: 'tense',
      kind: 'error',
      explanation: 'With "yesterday" (finished time) use past simple, and "an" before a vowel sound.',
      explanationPersian: 'با yesterday باید از گذشته ساده استفاده شود.',
      example: 'Yesterday I watched a film.',
    },
  ],
  vocabulary: [
    { original: 'really good experience', suggestion: 'great experience', reason: 'More natural collocation.', kind: 'style' },
  ],
  priorities: ['Past simple vs present perfect with finished time expressions'],
  followUpExercises: [
    {
      type: 'grammar-correction',
      prompt: 'Last week I have visited my uncle.',
      acceptedAnswers: ['Last week I visited my uncle.'],
      explanation: 'Finished time → past simple.',
    },
  ],
}

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('health endpoint reports status without secrets', async () => {
  const response = await fetch(`${base}/api/ai/health`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.defaultProvider, 'ollama')
  assert.ok(!JSON.stringify(body).includes('key'), 'health output must not mention keys')
})

test('providers endpoint lists configured/available state without credentials', async () => {
  const response = await fetch(`${base}/api/ai/providers`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.providers.length, 2)

  const raw = JSON.stringify(body)
  assert.ok(!raw.includes('apiKey'))
  assert.ok(!raw.includes('Bearer'))

  for (const provider of body.providers) {
    assert.ok(['ollama', 'cloud'].includes(provider.id))
    assert.equal(typeof provider.configured, 'boolean')
    assert.equal(typeof provider.available, 'boolean')
  }
})

test('rejects disallowed origins', async () => {
  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION }, { Origin: 'https://evil.example' })
  assert.equal(response.status, 403)
})

test('allows the configured origin', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify(VALID_EVALUATION)
  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION }, { Origin: 'http://localhost:5173' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('rejects invalid JSON bodies and oversized bodies', async () => {
  const invalid = await post('/api/ai/evaluate-writing', '{not json')
  assert.equal(invalid.status, 400)

  const oversized = await post('/api/ai/evaluate-writing', { text: 'x'.repeat(70000) })
  assert.equal(oversized.status, 413)
})

test('validates request fields', async () => {
  const missingText = await post('/api/ai/evaluate-writing', {})
  assert.equal(missingText.status, 400)

  const tooLong = await post('/api/ai/evaluate-writing', { text: 'word '.repeat(2000) })
  assert.equal(tooLong.status, 400)
  assert.match((await tooLong.json()).error, /exceeds/)

  const badProvider = await post('/api/ai/evaluate-writing', { text: 'Hello.', provider: 'other' })
  assert.equal(badProvider.status, 400)

  const badDetail = await post('/api/ai/evaluate-writing', { text: 'Hello.', detail: 'huge' })
  assert.equal(badDetail.status, 400)
})

test('returns a validated evaluation for well-formed model output', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify(VALID_EVALUATION)

  const response = await post('/api/ai/evaluate-writing', {
    text: SUBMISSION,
    task: 'Describe your weekend.',
    explanationLanguage: 'bilingual',
    learner: { nativeLanguage: 'Persian', selfReportedLevel: 'B1', levelSource: 'self-reported' },
  })

  assert.equal(response.status, 200)
  const body = await response.json()

  assert.equal(body.evaluation.sentences.length, 1)
  assert.equal(body.evaluation.sentences[0].kind, 'error')
  assert.ok(body.evaluation.sentences[0].explanationPersian.length > 0)
  assert.equal(body.meta.provider, 'ollama')
  assert.equal(body.meta.promptVersion, 'writing-evaluator-v1')
  assert.equal(body.meta.fallbackUsed, false)
})

test('strips markdown fences around model JSON', async () => {
  process.env.AI_TEST_RESPONSE = '```json\n' + JSON.stringify(VALID_EVALUATION) + '\n```'

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })
  assert.equal(response.status, 200)
})

test('drops sentence items that do not exist in the submission, with a warning', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({
    ...VALID_EVALUATION,
    sentences: [
      ...VALID_EVALUATION.sentences,
      {
        original: 'This sentence was never written by the learner.',
        corrected: 'Irrelevant.',
        category: 'tense',
        kind: 'error',
        explanation: 'Hallucinated reference.',
        explanationPersian: '',
        example: '',
      },
    ],
  })

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.evaluation.sentences.length, 1)
  assert.match(body.meta.warnings[0], /dropped 1 sentence/)
})

test('coerces unknown enum values instead of trusting them', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({
    ...VALID_EVALUATION,
    sentences: [{
      ...VALID_EVALUATION.sentences[0],
      category: 'made-up-category',
      kind: 'definitely-wrong',
    }],
  })

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })
  const body = await response.json()

  assert.equal(body.evaluation.sentences[0].category, 'other')
  assert.equal(body.evaluation.sentences[0].kind, 'style', 'unknown kind must downgrade to style, never to error')
})

test('invalid model output after bounded repair returns a safe 502', async () => {
  process.env.AI_TEST_RESPONSE = 'I am not JSON at all, sorry.'

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.code, 'invalid-model-output')
  assert.ok(!body.error.includes('stack'), 'no internals in error')
})

test('provider failure maps to safe structured errors', async () => {
  const cases = [
    ['unreachable', 503],
    ['timeout', 504],
    ['model-unavailable', 503],
    ['auth', 503],
    ['rate-limited', 429],
  ]

  for (const [code, status] of cases) {
    process.env.AI_TEST_FAILURE = code

    const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })
    const body = await response.json()

    assert.equal(response.status, status, `code ${code}`)
    assert.equal(body.code, code)
  }
})

test('no silent fallback: primary failure without allowFallback returns the error', async () => {
  process.env.AI_TEST_FAILURE = 'unreachable'
  process.env.AI_TEST_FAILURE_PROVIDER = 'ollama'
  process.env.AI_TEST_CLOUD_RESPONSE = JSON.stringify(VALID_EVALUATION)

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION })

  assert.equal(response.status, 503)
  assert.equal((await response.json()).provider, 'ollama')
})

test('explicit fallback: allowFallback=true switches provider and reports it', async () => {
  process.env.AI_TEST_FAILURE = 'unreachable'
  process.env.AI_TEST_FAILURE_PROVIDER = 'ollama'
  process.env.AI_TEST_CLOUD_RESPONSE = JSON.stringify(VALID_EVALUATION)

  const response = await post('/api/ai/evaluate-writing', { text: SUBMISSION, allowFallback: true })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.meta.provider, 'cloud')
  assert.equal(body.meta.fallbackUsed, true)
})

test('unknown routes return 404', async () => {
  const response = await fetch(`${base}/api/ai/unknown`)
  assert.equal(response.status, 404)
})

/* ================= conversation ================= */

const LEARNER_SENTENCE = 'I am working in this company since five years.'

const CHAT_MESSAGES = [
  { role: 'tutor', text: 'Nice to meet you! What do you do for work?' },
  { role: 'learner', text: LEARNER_SENTENCE },
]

const VALID_CHAT_RESPONSE = {
  reply: "That's interesting! What kind of projects do you work on?",
  corrections: [
    {
      original: 'I am working in this company since five years.',
      corrected: 'I have been working at this company for five years.',
      natural: "I've been with this company for five years.",
      category: 'tense',
      kind: 'error',
      explanation: 'Use present perfect continuous with "for" + a duration.',
      explanationPersian: 'برای بیان مدت زمان از حال کامل استمراری استفاده می‌شود.',
      example: 'I have been living here for two years.',
    },
    {
      original: 'I am working in this company since five years.',
      corrected: 'duplicate — should be dropped',
      category: 'tense',
      kind: 'error',
      explanation: 'dup',
      explanationPersian: '',
      example: '',
    },
  ],
}

test('chat returns a validated reply with corrections in gentle mode', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify(VALID_CHAT_RESPONSE)

  const response = await post('/api/ai/chat', {
    messages: CHAT_MESSAGES,
    mode: 'professional',
    feedbackMode: 'gentle',
    difficulty: 'B1',
    learner: { nativeLanguage: 'Persian' },
  })

  const body = await response.json()

  assert.equal(response.status, 200)
  assert.match(body.reply, /interesting/)
  assert.equal(body.corrections.length, 1, 'duplicate correction must be dropped')
  assert.equal(body.corrections[0].kind, 'error')
  assert.ok(body.corrections[0].explanationPersian.length > 0)
  assert.equal(body.meta.promptVersion, 'conversation-tutor-v1')
})

test('natural feedback mode strips ALL corrections server-side', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify(VALID_CHAT_RESPONSE)

  const response = await post('/api/ai/chat', {
    messages: CHAT_MESSAGES,
    feedbackMode: 'natural',
  })

  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.corrections.length, 0)
})

test('gentle mode drops style-only corrections', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({
    reply: 'Nice!',
    corrections: [{
      original: LEARNER_SENTENCE,
      corrected: 'A smoother phrasing.',
      category: 'naturalness',
      kind: 'style',
      explanation: 'Just style.',
      explanationPersian: '',
      example: '',
    }],
  })

  const response = await post('/api/ai/chat', { messages: CHAT_MESSAGES, feedbackMode: 'gentle' })
  const body = await response.json()

  assert.equal(body.corrections.length, 0)
})

test('corrections not quoting the learner message are dropped', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({
    reply: 'Okay!',
    corrections: [{
      original: 'A sentence the learner never wrote.',
      corrected: 'x',
      category: 'tense',
      kind: 'error',
      explanation: 'hallucinated',
      explanationPersian: '',
      example: '',
    }],
  })

  const response = await post('/api/ai/chat', { messages: CHAT_MESSAGES, feedbackMode: 'teacher' })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.corrections.length, 0)
  assert.match(body.meta.warnings[0], /dropped a correction/)
})

test('roleplay prompt version is used when a scenario is provided', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({ reply: 'Welcome to the interview!', corrections: [] })

  const response = await post('/api/ai/chat', {
    messages: CHAT_MESSAGES,
    mode: 'roleplay',
    scenario: {
      title: 'Job Interview',
      aiRole: 'Hiring manager',
      learnerRole: 'Candidate',
      objective: 'Answer questions',
      context: 'An interview.',
    },
  })

  const body = await response.json()

  assert.equal(body.meta.promptVersion, 'roleplay-tutor-v1')
})

test('chat request validation: last message must be from the learner; enums checked', async () => {
  const tutorLast = await post('/api/ai/chat', {
    messages: [{ role: 'learner', text: 'Hi' }, { role: 'tutor', text: 'Hello!' }],
  })
  assert.equal(tutorLast.status, 400)

  const badMode = await post('/api/ai/chat', { messages: CHAT_MESSAGES, mode: 'karaoke' })
  assert.equal(badMode.status, 400)

  const badFeedback = await post('/api/ai/chat', { messages: CHAT_MESSAGES, feedbackMode: 'brutal' })
  assert.equal(badFeedback.status, 400)

  const empty = await post('/api/ai/chat', { messages: [] })
  assert.equal(empty.status, 400)
})

test('chat missing reply triggers repair then safe 502; transcript is untouched client-side', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({ corrections: [] })

  const response = await post('/api/ai/chat', { messages: CHAT_MESSAGES })
  const body = await response.json()

  assert.equal(response.status, 502)
  assert.equal(body.code, 'invalid-model-output')
})

test('conversation summary returns validated structure with caps', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({
    overall: 'A good conversation with clear progress on work vocabulary.',
    strengths: ['Good vocabulary', 'Clear questions', 'Confidence', 'extra strength dropped'],
    improvements: ['Present perfect'],
    corrections: Array.from({ length: 8 }, (_, i) => ({
      original: `mistake ${i}`,
      corrected: `fixed ${i}`,
      category: 'tense',
      kind: 'error',
      explanation: 'x',
      explanationPersian: '',
    })),
    usefulExpressions: [{ expression: 'by the way', meaning: 'introducing a new topic', meaningPersian: 'راستی' }],
    suggestedNextActivity: 'Practice the present perfect grammar topic.',
  })

  const response = await post('/api/ai/conversation-summary', {
    messages: CHAT_MESSAGES,
    mode: 'professional',
  })

  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.summary.strengths.length, 3, 'strengths capped at 3')
  assert.equal(body.summary.corrections.length, 5, 'corrections capped at 5')
  assert.equal(body.summary.usefulExpressions[0].meaningPersian, 'راستی')
  assert.equal(body.meta.promptVersion, 'conversation-summary-v1')
})

test('assist validates kind and text and returns a reply', async () => {
  process.env.AI_TEST_RESPONSE = JSON.stringify({ reply: 'اتوبوس تا ده دقیقه دیگر حرکت می‌کند.' })

  const ok = await post('/api/ai/assist', { kind: 'translate', text: 'The bus leaves in ten minutes.' })
  const body = await ok.json()

  assert.equal(ok.status, 200)
  assert.ok(body.reply.length > 0)

  const badKind = await post('/api/ai/assist', { kind: 'summon', text: 'hello' })
  assert.equal(badKind.status, 400)

  const noText = await post('/api/ai/assist', { kind: 'explain', text: '' })
  assert.equal(noText.status, 400)
})

test('chat provider failure returns safe error and respects no-silent-fallback', async () => {
  process.env.AI_TEST_FAILURE = 'unreachable'
  process.env.AI_TEST_FAILURE_PROVIDER = 'ollama'
  process.env.AI_TEST_CLOUD_RESPONSE = JSON.stringify({ reply: 'Fallback reply', corrections: [] })

  const noFallback = await post('/api/ai/chat', { messages: CHAT_MESSAGES })
  assert.equal(noFallback.status, 503)

  const withFallback = await post('/api/ai/chat', { messages: CHAT_MESSAGES, allowFallback: true })
  const body = await withFallback.json()

  assert.equal(withFallback.status, 200)
  assert.equal(body.meta.provider, 'cloud')
  assert.equal(body.meta.fallbackUsed, true)
})
