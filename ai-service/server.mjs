import { createServer } from 'node:http'

import { loadConfig } from './config.mjs'
import { AIProviderError, createRegistry } from './providers.mjs'
import {
  WRITING_EVALUATOR_PROMPT_VERSION,
  buildRepairPrompt,
  buildWritingEvaluationPrompt,
} from './prompts.mjs'
import {
  extractJson,
  validateEvaluateRequest,
  validateEvaluation,
} from './validation.mjs'

const { config, problems } = loadConfig()

if (problems.length) {
  for (const problem of problems) {
    process.stderr.write(`[ai-service] configuration error: ${problem}\n`)
  }

  if (!config.testMode) process.exit(1)
}

const registry = createRegistry(config)

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

async function generateWithProvider(provider, model, prompt) {
  return provider.generate({
    system: prompt.system,
    user: prompt.user,
    model,
    temperature: 0.3,
    maxTokens: 4000,
    timeoutMs: config.requestTimeoutMs,
    json: true,
  })
}

async function handleEvaluateWriting(req, res) {
  const body = await readBody(req, res)
  if (body === null) return

  const validation = validateEvaluateRequest(body, config)

  if (!validation.ok) {
    return reply(res, 400, { error: validation.errors.join('; ') })
  }

  const request = validation.value

  let provider = registry.resolve(request.provider)
  let model = request.model ?? registry.modelFor(provider.id)
  let fallbackUsed = false

  /* Only models explicitly configured server-side may be requested. */
  const allowedModels = registry.modelsFor(provider.id)
  if (request.model && allowedModels.length && !allowedModels.includes(request.model)) {
    return reply(res, 400, { error: `Model "${request.model}" is not configured for provider "${provider.id}"` })
  }

  const prompt = buildWritingEvaluationPrompt({
    text: request.text,
    task: request.task,
    learner: request.learner,
    detail: request.detail,
    explanationLanguage: request.explanationLanguage,
  })

  const started = Date.now()
  let response

  try {
    response = await generateWithProvider(provider, model, prompt)
  } catch (error) {
    if (!(error instanceof AIProviderError)) {
      log('ai.unexpected.error', { message: error.message })
      return reply(res, 500, { error: 'Internal evaluation error' })
    }

    /*
     * Explicit, configured fallback only. The learner's chosen provider
     * failed; if AI_FALLBACK_PROVIDER is set AND the client allowed
     * fallback, retry there — and tell the client that happened, since
     * their text is being sent to a different provider.
     */
    const fallback = config.fallbackProvider && body.allowFallback === true
      ? registry.get(config.fallbackProvider)
      : null

    if (!fallback || fallback.id === provider.id) {
      return providerErrorResponse(res, error, provider.id)
    }

    log('ai.fallback', { from: provider.id, to: fallback.id, code: error.code })
    provider = fallback
    model = registry.modelFor(fallback.id)
    fallbackUsed = true

    try {
      response = await generateWithProvider(provider, model, prompt)
    } catch (fallbackError) {
      if (fallbackError instanceof AIProviderError) {
        return providerErrorResponse(res, fallbackError, provider.id)
      }
      log('ai.unexpected.error', { message: fallbackError.message })
      return reply(res, 500, { error: 'Internal evaluation error' })
    }
  }

  /* Parse + validate the untrusted model output, with bounded repair. */
  let attempt = 0
  let result

  for (;;) {
    if (response.content.length > config.maxResponseChars) {
      result = { ok: false, errors: ['model response exceeds the size limit'] }
    } else {
      const parsed = extractJson(response.content)
      result = parsed === null
        ? { ok: false, errors: ['response is not valid JSON'] }
        : validateEvaluation(parsed, request.text)
    }

    if (result.ok || attempt >= config.maxRepairAttempts) break

    attempt++
    log('ai.repair.attempt', { provider: provider.id, attempt, errors: result.errors.slice(0, 3) })

    try {
      response = await provider.generate({
        system: prompt.system,
        user: buildRepairPrompt(prompt.user, result.errors),
        model,
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: config.requestTimeoutMs,
        json: true,
      })
    } catch (error) {
      if (error instanceof AIProviderError) return providerErrorResponse(res, error, provider.id)
      return reply(res, 500, { error: 'Internal evaluation error' })
    }
  }

  if (!result.ok) {
    log('ai.validation.failed', { provider: provider.id, model, errors: result.errors.slice(0, 5) })
    return reply(res, 502, {
      error: 'The AI response could not be validated as structured feedback. Your text was not lost — try again or switch provider.',
      code: 'invalid-model-output',
      provider: provider.id,
    })
  }

  log('ai.evaluation.ok', {
    provider: provider.id,
    model: response.model,
    durationMs: Date.now() - started,
    textChars: request.text.length,
    sentences: result.evaluation.sentences.length,
    repairAttempts: attempt,
    fallbackUsed,
    warnings: result.errors,
  })

  reply(res, 200, {
    evaluation: result.evaluation,
    meta: {
      provider: provider.id,
      model: response.model,
      promptVersion: WRITING_EVALUATOR_PROMPT_VERSION,
      durationMs: Date.now() - started,
      fallbackUsed,
      warnings: result.errors,
      usage: response.usage ?? null,
    },
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

  if (req.method === 'POST' && url.pathname === '/api/ai/evaluate-writing') {
    if (!withinRateLimit(req)) {
      res.setHeader('Retry-After', '60')
      return reply(res, 429, { error: 'Rate limit exceeded — try again in a minute' })
    }

    try {
      return await handleEvaluateWriting(req, res)
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
