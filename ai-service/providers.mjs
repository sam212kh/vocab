/**
 * Provider adapters + registry. Each adapter exposes the same contract:
 *
 *   id                      'ollama' | 'cloud'
 *   configured()            → boolean (static config present)
 *   healthCheck()           → { available, detail?, models? }  (live probe)
 *   generate(request)       → { content, model, provider, usage, durationMs, finishReason }
 *
 * generate() request: { system, user, model, temperatureNumber, maxTokens, timeoutMs, json }
 *
 * Errors are thrown as AIProviderError with a machine-readable `code` so the
 * gateway can map them to safe HTTP responses without leaking internals.
 */

export class AIProviderError extends Error {
  /**
   * @param {'unreachable'|'timeout'|'model-unavailable'|'auth'|'rate-limited'|'provider-error'|'empty-response'} code
   */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') throw new AIProviderError('timeout', 'Provider request timed out')
    throw new AIProviderError('unreachable', 'Provider is unreachable')
  } finally {
    clearTimeout(timer)
  }
}

export function createOllamaProvider(config) {
  const base = config.ollama.baseUrl

  return {
    id: 'ollama',

    configured() {
      return Boolean(config.ollama.model)
    },

    async healthCheck() {
      try {
        const response = await fetchWithTimeout(`${base}/api/tags`, {}, 5000)

        if (!response.ok) return { available: false, detail: `Ollama returned HTTP ${response.status}` }

        const body = await response.json()
        const installed = Array.isArray(body.models) ? body.models.map(m => m.name) : []

        return { available: true, models: installed }
      } catch (error) {
        return { available: false, detail: error instanceof AIProviderError && error.code === 'timeout' ? 'Ollama health check timed out' : 'Ollama is not reachable' }
      }
    },

    async generate({ system, user, model, temperature, maxTokens, timeoutMs, json }) {
      const started = Date.now()

      const response = await fetchWithTimeout(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          ...(json && config.ollama.jsonMode ? { format: 'json' } : {}),
          options: {
            temperature,
            ...(maxTokens ? { num_predict: maxTokens } : {}),
          },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      }, timeoutMs)

      if (response.status === 404) throw new AIProviderError('model-unavailable', `Model "${model}" is not available in Ollama`)
      if (!response.ok) throw new AIProviderError('provider-error', `Ollama returned HTTP ${response.status}`)

      const body = await response.json()
      const content = body?.message?.content

      if (typeof content !== 'string' || !content.trim()) {
        throw new AIProviderError('empty-response', 'Ollama returned an empty response')
      }

      return {
        content,
        model: body.model ?? model,
        provider: 'ollama',
        usage: {
          promptTokens: body.prompt_eval_count ?? null,
          completionTokens: body.eval_count ?? null,
        },
        durationMs: Date.now() - started,
        finishReason: body.done_reason ?? null,
      }
    },
  }
}

export function createCloudProvider(config) {
  const { baseUrl, apiKey, wireFormat } = config.cloud

  return {
    id: 'cloud',

    configured() {
      return Boolean(baseUrl && apiKey && config.cloud.model)
    },

    async healthCheck() {
      if (!this.configured()) return { available: false, detail: 'Cloud provider is not configured on the server' }

      try {
        const response = await fetchWithTimeout(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }, 5000)

        if (response.status === 401 || response.status === 403) return { available: false, detail: 'Cloud API credentials were rejected' }
        if (!response.ok) return { available: false, detail: `Cloud API returned HTTP ${response.status}` }

        const body = await response.json().catch(() => null)
        const models = Array.isArray(body?.data) ? body.data.map(m => m.id).slice(0, 50) : undefined

        return { available: true, models }
      } catch {
        return { available: false, detail: 'Cloud API is not reachable' }
      }
    },

    async generate({ system, user, model, temperature, maxTokens, timeoutMs, json }) {
      if (wireFormat !== 'openai-chat') {
        throw new AIProviderError('provider-error', `Unsupported cloud wire format: ${wireFormat}`)
      }

      const started = Date.now()

      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(json && config.cloud.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      }, timeoutMs)

      if (response.status === 401 || response.status === 403) throw new AIProviderError('auth', 'Cloud API credentials were rejected')
      if (response.status === 404) throw new AIProviderError('model-unavailable', `Model "${model}" is not available`)
      if (response.status === 429) throw new AIProviderError('rate-limited', 'Cloud API rate limit reached')
      if (!response.ok) throw new AIProviderError('provider-error', `Cloud API returned HTTP ${response.status}`)

      const body = await response.json()
      const choice = body?.choices?.[0]
      const content = choice?.message?.content

      if (typeof content !== 'string' || !content.trim()) {
        throw new AIProviderError('empty-response', 'Cloud API returned an empty response')
      }

      return {
        content,
        model: body.model ?? model,
        provider: 'cloud',
        usage: {
          promptTokens: body.usage?.prompt_tokens ?? null,
          completionTokens: body.usage?.completion_tokens ?? null,
        },
        durationMs: Date.now() - started,
        finishReason: choice?.finish_reason ?? null,
      }
    },
  }
}

/**
 * Deterministic test provider, active only under NODE_ENV=test — the same
 * pattern tts-service uses. Controlled via env:
 *   AI_TEST_RESPONSE        literal content to return
 *   AI_TEST_FAILURE         provider error code to throw
 *   AI_TEST_DELAY_MS        artificial latency
 */
export function createTestProvider(id, env = process.env) {
  return {
    id,
    configured: () => env[`AI_TEST_${id.toUpperCase()}_UNCONFIGURED`] !== '1',
    async healthCheck() {
      if (env.AI_TEST_UNAVAILABLE === '1') return { available: false, detail: 'test unavailable' }
      return { available: true, models: ['test-model'] }
    },
    async generate({ model, timeoutMs }) {
      const delay = Number(env.AI_TEST_DELAY_MS ?? 0)
      const failureTargets = env.AI_TEST_FAILURE_PROVIDER ?? ''
      if (env.AI_TEST_FAILURE && (!failureTargets || failureTargets === id)) {
        throw new AIProviderError(env.AI_TEST_FAILURE, `Test failure: ${env.AI_TEST_FAILURE}`)
      }
      if (delay > timeoutMs) throw new AIProviderError('timeout', 'Provider request timed out')
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))

      return {
        content: (id === 'cloud' && env.AI_TEST_CLOUD_RESPONSE) || env.AI_TEST_RESPONSE || '{}',
        model,
        provider: id,
        usage: { promptTokens: 10, completionTokens: 20 },
        durationMs: delay,
        finishReason: 'stop',
      }
    },
  }
}

export function createRegistry(config, env = process.env) {
  const providers = new Map()

  if (config.testMode) {
    providers.set('ollama', createTestProvider('ollama', env))
    providers.set('cloud', createTestProvider('cloud', env))
  } else {
    providers.set('ollama', createOllamaProvider(config))
    providers.set('cloud', createCloudProvider(config))
  }

  function get(id) {
    return providers.get(id) ?? null
  }

  function resolve(requestedId) {
    const id = requestedId && providers.has(requestedId) ? requestedId : config.defaultProvider
    return get(id)
  }

  function modelFor(providerId) {
    return providerId === 'cloud' ? config.cloud.model : config.ollama.model
  }

  function modelsFor(providerId) {
    return providerId === 'cloud' ? config.cloud.models : config.ollama.models
  }

  return { get, resolve, modelFor, modelsFor, ids: () => [...providers.keys()] }
}
