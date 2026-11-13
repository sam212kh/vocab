/**
 * Environment-based configuration with startup validation.
 * Mirrors tts-service conventions: loopback bind by default, everything
 * overridable via env, secrets never logged.
 */

function integer(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

/** Like integer() but allows 0 — port 0 means "pick an ephemeral port" (used by tests). */
function port(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

export function loadConfig(env = process.env) {
  const config = {
    host: env.AI_HOST ?? '127.0.0.1',
    port: port(env.AI_SERVICE_PORT, 8788),
    allowedOrigins: (env.AI_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map(origin => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    /** 'ollama' | 'cloud' — the default provider when a request does not specify one. */
    defaultProvider: env.AI_PROVIDER ?? 'ollama',
    /**
     * Explicit fallback: '' (disabled, default) or a provider id. Never
     * applied silently — responses carry fallbackUsed:true so the UI can
     * tell the learner their text went to the other provider.
     */
    fallbackProvider: env.AI_FALLBACK_PROVIDER ?? '',
    requestTimeoutMs: integer(env.AI_REQUEST_TIMEOUT_MS, 90000),
    rateLimitPerMinute: integer(env.AI_RATE_LIMIT_PER_MINUTE, 10),
    maxBodyBytes: integer(env.AI_MAX_BODY_BYTES, 65536),
    /** Hard cap on characters of learner text accepted for evaluation. */
    maxSubmissionChars: integer(env.AI_MAX_SUBMISSION_CHARS, 8000),
    /** Cap on raw model output we are willing to parse. */
    maxResponseChars: integer(env.AI_MAX_RESPONSE_CHARS, 60000),
    /** Bounded repair attempts when the model returns invalid JSON. */
    maxRepairAttempts: integer(env.AI_MAX_REPAIR_ATTEMPTS, 1),

    ollama: {
      baseUrl: (env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, ''),
      model: env.OLLAMA_MODEL ?? '',
      /** Comma-separated additional models the UI may offer. */
      models: (env.OLLAMA_MODELS ?? env.OLLAMA_MODEL ?? '').split(',').map(m => m.trim()).filter(Boolean),
      /** Whether the configured model supports format:"json" structured output. */
      jsonMode: env.OLLAMA_JSON_MODE !== '0',
    },

    cloud: {
      baseUrl: (env.CLOUD_API_BASE_URL ?? '').replace(/\/$/, ''),
      apiKey: env.CLOUD_API_KEY ?? '',
      model: env.CLOUD_MODEL ?? '',
      models: (env.CLOUD_MODELS ?? env.CLOUD_MODEL ?? '').split(',').map(m => m.trim()).filter(Boolean),
      /** 'openai-chat' is the only wire format implemented; explicit so future formats are a config choice, not an assumption. */
      wireFormat: env.CLOUD_WIRE_FORMAT ?? 'openai-chat',
      jsonMode: env.CLOUD_JSON_MODE !== '0',
    },

    assessment: {
      stateDir: env.ASSESSMENT_STATE_DIR ?? new URL('./.assessment-state', import.meta.url).pathname,
      banksDir: env.ASSESSMENT_BANKS_DIR ?? new URL('./assessment/banks', import.meta.url).pathname,
      rateLimitPerMinute: integer(env.ASSESSMENT_RATE_LIMIT_PER_MINUTE, 60),
    },

    testMode: env.NODE_ENV === 'test',
  }

  const problems = []

  if (!['ollama', 'cloud'].includes(config.defaultProvider)) {
    problems.push(`AI_PROVIDER must be "ollama" or "cloud", got "${config.defaultProvider}"`)
  }

  if (config.fallbackProvider && !['ollama', 'cloud'].includes(config.fallbackProvider)) {
    problems.push(`AI_FALLBACK_PROVIDER must be "ollama", "cloud" or empty`)
  }

  if (config.fallbackProvider === config.defaultProvider) {
    config.fallbackProvider = ''
  }

  if (!config.testMode) {
    if (config.defaultProvider === 'ollama' && !config.ollama.model) {
      problems.push('OLLAMA_MODEL is required when AI_PROVIDER=ollama')
    }

    if (config.defaultProvider === 'cloud') {
      if (!config.cloud.baseUrl) problems.push('CLOUD_API_BASE_URL is required when AI_PROVIDER=cloud')
      if (!config.cloud.apiKey) problems.push('CLOUD_API_KEY is required when AI_PROVIDER=cloud')
      if (!config.cloud.model) problems.push('CLOUD_MODEL is required when AI_PROVIDER=cloud')
    }
  }

  return { config, problems }
}
