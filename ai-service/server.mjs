import { createServer } from 'node:http'

import { loadConfig } from './config.mjs'
import { AIProviderError, createRegistry } from './providers.mjs'
import {
  WRITING_EVALUATOR_PROMPT_VERSION,
  buildAssistPrompt,
  buildConversationPrompt,
  buildRepairPrompt,
  buildSummaryPrompt,
  buildWritingEvaluationPrompt,
} from './prompts.mjs'
import {
  extractJson,
  validateAssistRequest,
  validateAssistResponse,
  validateChatRequest,
  validateChatResponse,
  validateEvaluateRequest,
  validateEvaluation,
  validateSummaryResponse,
} from './validation.mjs'
import { createAssessmentModule } from './assessment/routes.mjs'

const { config, problems } = loadConfig()

if (problems.length) {
  for (const problem of problems) {
    process.stderr.write(`[ai-service] configuration error: ${problem}\n`)
  }

  if (!config.testMode) process.exit(1)
}

const registry = createRegistry(config)

const assessment = createAssessmentModule({
  stateDir: config.assessment.stateDir,
  banksDir: config.assessment.banksDir,
  rateLimitPerMinute: config.assessment.rateLimitPerMinute,
  log: (event, fields) => log(event, fields),
})

const limits = new Map()
let shuttingDown = false

/* Log metadata only — never full learner submissions, never credentials. */
function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`)
}

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

function allowedOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true

  const wildcard = config.allowedOrigins.includes('*')
  if (!wildcard && !config.allowedOrigins.includes(origin)) return false

  res.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin)
  if (!wildcard) res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  return true
}

function withinRateLimit(req) {
  const now = Date.now()
  const ip = req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? 'unknown'
  const entry = limits.get(ip) ?? { count: 0, reset: now + 60000 }

  if (entry.reset <= now) {
    entry.count = 0
    entry.reset = now + 60000
  }

  entry.count++
  limits.set(ip, entry)

  if (limits.size > 5000) {
    for (const [key, value] of limits) if (value.reset < now) limits.delete(key)
  }

  return entry.count <= config.rateLimitPerMinute
}

async function readBody(req, res) {
  let raw = ''

  for await (const chunk of req) {
    raw += chunk

    if (Buffer.byteLength(raw) > config.maxBodyBytes) {
      reply(res, 413, { error: 'Request body is too large' })
      return null
    }
  }

  try {
    return JSON.parse(raw)
  } catch {
    reply(res, 400, { error: 'Invalid JSON body' })
    return null
  }
}

function providerErrorResponse(res, error, providerId) {
  const map = {
    unreachable: [503, `The ${providerId} provider is not reachable`],
    timeout: [504, 'The AI provider timed out'],
    'model-unavailable': [503, error.message],
    auth: [503, 'Cloud API credentials were rejected — check the server configuration'],
    'rate-limited': [429, 'The AI provider rate limit was reached — try again shortly'],
    'provider-error': [502, 'The AI provider returned an error'],
    'empty-response': [502, 'The AI provider returned an empty response'],
  }

  const [status, message] = map[error.code] ?? [502, 'The AI provider failed']

  log('ai.provider.error', { provider: providerId, code: error.code, status })
  reply(res, status, { error: message, code: error.code, provider: providerId })
}

/**
 * Shared generation pipeline used by every AI endpoint:
 * provider resolution + model allowlist + explicit fallback + bounded
 * repair + response validation. Replies with the error itself and returns
 * null on failure; returns { provider, response, value, warnings,
 * fallbackUsed, attempt } on success.
 */
async function runGeneration(res, { body, requestedProvider, requestedModel, prompt, validate, maxTokens = 4000, temperature = 0.4 }) {
  let provider = registry.resolve(requestedProvider)
  let model = requestedModel ?? registry.modelFor(provider.id)
  let fallbackUsed = false

  const allowedModels = registry.modelsFor(provider.id)
  if (requestedModel && allowedModels.length && !allowedModels.includes(requestedModel)) {
    reply(res, 400, { error: `Model "${requestedModel}" is not configured for provider "${provider.id}"` })
    return null
  }

  const generationOptions = () => ({
    system: prompt.system,
    user: prompt.user,
    model,
    temperature,
    maxTokens,
    timeoutMs: config.requestTimeoutMs,
    json: true,
  })

  let response

  try {
    response = await provider.generate(generationOptions())
  } catch (error) {
    if (!(error instanceof AIProviderError)) {
      log('ai.unexpected.error', { message: error.message })
      reply(res, 500, { error: 'Internal evaluation error' })
      return null
    }

    /* Explicit, configured fallback only — never silent. */
    const fallback = config.fallbackProvider && body.allowFallback === true
      ? registry.get(config.fallbackProvider)
      : null

    if (!fallback || fallback.id === provider.id) {
      providerErrorResponse(res, error, provider.id)
      return null
    }

    log('ai.fallback', { from: provider.id, to: fallback.id, code: error.code })
    provider = fallback
    model = registry.modelFor(fallback.id)
    fallbackUsed = true

    try {
      response = await provider.generate(generationOptions())
    } catch (fallbackError) {
      if (fallbackError instanceof AIProviderError) {
        providerErrorResponse(res, fallbackError, provider.id)
      } else {
        log('ai.unexpected.error', { message: fallbackError.message })
        reply(res, 500, { error: 'Internal evaluation error' })
      }
      return null
    }
  }

  let attempt = 0
  let result

  for (;;) {
    if (response.content.length > config.maxResponseChars) {
      result = { ok: false, errors: ['model response exceeds the size limit'] }
    } else {
      const parsed = extractJson(response.content)
      result = parsed === null
        ? { ok: false, errors: ['response is not valid JSON'] }
        : validate(parsed)
    }

    if (result.ok || attempt >= config.maxRepairAttempts) break

    attempt++
    log('ai.repair.attempt', { provider: provider.id, attempt, errors: result.errors.slice(0, 3) })

    try {
      response = await provider.generate({
        ...generationOptions(),
        user: buildRepairPrompt(prompt.user, result.errors),
        temperature: 0.2,
      })
    } catch (error) {
      if (error instanceof AIProviderError) {
        providerErrorResponse(res, error, provider.id)
      } else {
        reply(res, 500, { error: 'Internal evaluation error' })
      }
      return null
    }
  }

  if (!result.ok) {
    log('ai.validation.failed', { provider: provider.id, model, errors: result.errors.slice(0, 5) })
    reply(res, 502, {
      error: 'The AI response could not be validated. Your text was not lost — try again or switch provider.',
      code: 'invalid-model-output',
      provider: provider.id,
    })
    return null
  }

  return {
    provider,
    response,
    value: result.value ?? result.evaluation,
    warnings: result.errors,
    fallbackUsed,
    attempt,
  }
}

function meta(outcome, promptVersion, started) {
  return {
    provider: outcome.provider.id,
    model: outcome.response.model,
    promptVersion,
    durationMs: Date.now() - started,
    fallbackUsed: outcome.fallbackUsed,
    warnings: outcome.warnings,
    usage: outcome.response.usage ?? null,
  }
}

async function handleEvaluateWriting(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  const validation = validateEvaluateRequest(body, config)

  if (!validation.ok) {
    return reply(res, 400, { error: validation.errors.join('; ') })
  }

  const request = validation.value

  const prompt = buildWritingEvaluationPrompt({
    text: request.text,
    task: request.task,
    learner: request.learner,
    detail: request.detail,
    explanationLanguage: request.explanationLanguage,
  })

  const started = Date.now()

  const outcome = await runGeneration(res, {
    body,
    requestedProvider: request.provider,
    requestedModel: request.model,
    prompt,
    temperature: 0.3,
    validate: parsed => validateEvaluation(parsed, request.text),
  })

  if (!outcome) return

  log('ai.evaluation.ok', {
    provider: outcome.provider.id,
    model: outcome.response.model,
    durationMs: Date.now() - started,
    textChars: request.text.length,
    sentences: outcome.value.sentences.length,
    repairAttempts: outcome.attempt,
    fallbackUsed: outcome.fallbackUsed,
    warnings: outcome.warnings,
  })

  reply(res, 200, {
    evaluation: outcome.value,
    meta: meta(outcome, WRITING_EVALUATOR_PROMPT_VERSION, started),
  })
}

async function handleChat(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  const validation = validateChatRequest(body, config)

  if (!validation.ok) {
    return reply(res, 400, { error: validation.errors.join('; ') })
  }

  const request = validation.value

  const prompt = buildConversationPrompt(request)

  const lastLearnerMessage = request.messages[request.messages.length - 1].text

  const started = Date.now()

  const outcome = await runGeneration(res, {
    body,
    requestedProvider: request.provider,
    requestedModel: request.model,
    prompt,
    temperature: 0.6,
    validate: parsed => validateChatResponse(parsed, lastLearnerMessage, request.feedbackMode),
  })

  if (!outcome) return

  log('ai.chat.ok', {
    provider: outcome.provider.id,
    model: outcome.response.model,
    mode: request.mode,
    feedbackMode: request.feedbackMode,
    durationMs: Date.now() - started,
    messages: request.messages.length,
    corrections: outcome.value.corrections.length,
    fallbackUsed: outcome.fallbackUsed,
  })

  reply(res, 200, {
    reply: outcome.value.reply,
    corrections: outcome.value.corrections,
    meta: meta(outcome, prompt.promptVersion, started),
  })
}

async function handleSummary(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  /* Summary reuses the chat request validation for transcript + learner. */
  const validation = validateChatRequest({ ...body, feedbackMode: 'teacher' }, config)

  if (!validation.ok) {
    return reply(res, 400, { error: validation.errors.join('; ') })
  }

  const request = validation.value

  const prompt = buildSummaryPrompt({
    messages: request.messages,
    mode: request.mode,
    scenarioTitle: request.scenario?.title,
    explanationLanguage: request.explanationLanguage,
    learner: request.learner,
  })

  const started = Date.now()

  const outcome = await runGeneration(res, {
    body,
    requestedProvider: request.provider,
    requestedModel: request.model,
    prompt,
    temperature: 0.3,
    validate: validateSummaryResponse,
  })

  if (!outcome) return

  log('ai.summary.ok', {
    provider: outcome.provider.id,
    durationMs: Date.now() - started,
    messages: request.messages.length,
    fallbackUsed: outcome.fallbackUsed,
  })

  reply(res, 200, {
    summary: outcome.value,
    meta: meta(outcome, prompt.promptVersion, started),
  })
}

async function handleAssist(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  const validation = validateAssistRequest(body)

  if (!validation.ok) {
    return reply(res, 400, { error: validation.errors.join('; ') })
  }

  const request = validation.value

  const prompt = buildAssistPrompt(request)

  const started = Date.now()

  const outcome = await runGeneration(res, {
    body,
    requestedProvider: request.provider,
    requestedModel: request.model,
    prompt,
    maxTokens: 1000,
    temperature: 0.3,
    validate: validateAssistResponse,
  })

  if (!outcome) return

  log('ai.assist.ok', { provider: outcome.provider.id, kind: request.kind, durationMs: Date.now() - started })

  reply(res, 200, {
    reply: outcome.value.reply,
    meta: meta(outcome, prompt.promptVersion, started),
  })
}

async function handleProviders(_req, res) {
  const results = []

  for (const id of registry.ids()) {
    const provider = registry.get(id)
    const configured = provider.configured()
    const health = configured ? await provider.healthCheck() : { available: false, detail: 'Not configured on the server' }

    results.push({
      id,
      configured,
      available: Boolean(health.available),
      detail: health.detail ?? null,
      defaultModel: registry.modelFor(id) || null,
      models: registry.modelsFor(id),
      installedModels: health.models ?? null,
    })
  }

  reply(res, 200, { defaultProvider: config.defaultProvider, fallbackProvider: config.fallbackProvider || null, providers: results })
}

const POST_ROUTES = new Map([
  ['/api/ai/evaluate-writing', handleEvaluateWriting],
  ['/api/ai/chat', handleChat],
  ['/api/ai/conversation-summary', handleSummary],
  ['/api/ai/assist', handleAssist],
])

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (!allowedOrigin(req, res)) return reply(res, 403, { error: 'Origin is not allowed' })
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  if (req.method === 'GET' && url.pathname === '/api/ai/health') {
    return reply(res, 200, {
      status: shuttingDown ? 'shutting-down' : 'ok',
      defaultProvider: config.defaultProvider,
      fallbackConfigured: Boolean(config.fallbackProvider),
    })
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/providers') {
    return handleProviders(req, res)
  }

  if (url.pathname.startsWith('/api/assessment/')) {
    try {
      const handled = await assessment.handle(req, res, url, { reply, readBody })
      if (handled) return
    } catch (error) {
      log('assessment.unhandled.error', { message: error.message })
      if (!res.headersSent) reply(res, 500, { error: 'Internal assessment error' })
      return
    }
  }

  const handler = req.method === 'POST' ? POST_ROUTES.get(url.pathname) : undefined

  if (handler) {
    if (!withinRateLimit(req)) {
      res.setHeader('Retry-After', '60')
      return reply(res, 429, { error: 'Rate limit exceeded — try again in a minute' })
    }

    try {
      return await handler(req, res)
    } catch (error) {
      log('ai.unhandled.error', { message: error.message })
      if (!res.headersSent) reply(res, 500, { error: 'Internal evaluation error' })
      return
    }
  }

  reply(res, 404, { error: 'Not found' })
})

server.headersTimeout = 10000
server.requestTimeout = config.requestTimeoutMs + 30000

server.listen(config.port, config.host, () =>
  log('server.started', {
    host: config.host,
    port: config.port,
    defaultProvider: config.defaultProvider,
    fallbackProvider: config.fallbackProvider || null,
  })
)

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { server, config }
