import { AIClientError } from './aiClient'

const MESSAGES: Record<string, string> = {
    'gateway-unreachable': 'The AI service is not running. Start it and retry.',
    unreachable: 'The AI provider is not reachable. Check AI Settings and retry.',
    timeout: 'The AI provider timed out. Retry in a moment.',
    'model-unavailable': 'The selected model is not available. Pick another model in AI Settings.',
    auth: 'The AI provider rejected its credentials on the server.',
    'rate-limited': 'The AI provider is rate-limited right now. Retry in a minute.',
    'invalid-model-output': 'The model returned an unusable response. Retry or switch model in AI Settings.',
    'bad-request': 'That request could not be processed.',
    'provider-error': 'The AI provider returned an error. Retry or switch provider in AI Settings.',
    'empty-response': 'The model returned an empty response. Retry.',
}

const GENERIC = 'Something went wrong. Please retry.'

/**
 * Maps an AI failure to a fixed, learner-safe message keyed by error code.
 * Never echoes `err.message` (which can carry server/provider text).
 */
export function describeAIError(err: unknown): string {
    if (err instanceof AIClientError) return MESSAGES[err.code] ?? GENERIC

    return GENERIC
}
