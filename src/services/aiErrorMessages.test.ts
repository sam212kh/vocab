import { describe, expect, it } from 'vitest'

import { AIClientError, type AIClientErrorCode } from './aiClient'
import { describeAIError } from './aiErrorMessages'

const CODES: AIClientErrorCode[] = [
    'unreachable', 'timeout', 'model-unavailable', 'auth', 'rate-limited',
    'provider-error', 'empty-response', 'invalid-model-output', 'bad-request', 'gateway-unreachable',
]

const LEAKY = 'ECONNREFUSED 127.0.0.1:11434 at /opt/english-upgrade/ai-service/providers.mjs:88 (key sk-abc123, model qwen2.5)'

describe('describeAIError', () => {
    it.each(CODES)('code "%s" maps to a fixed message that never echoes err.message', code => {
        const message = describeAIError(new AIClientError(code, LEAKY, 'ollama'))

        expect(message.length).toBeGreaterThan(10)
        for (const leak of ['ECONNREFUSED', '127.0.0.1', '/opt/', '.mjs', 'sk-abc123', 'qwen', 'ollama', 'providers.mjs:88']) {
            expect(message).not.toContain(leak)
        }
    })

    it('preserves distinctions between failure kinds', () => {
        const messages = new Set(CODES.map(code => describeAIError(new AIClientError(code, 'x'))))

        expect(messages.size).toBe(CODES.length)
        expect(describeAIError(new AIClientError('gateway-unreachable', ''))).toMatch(/not running/i)
        expect(describeAIError(new AIClientError('timeout', ''))).toMatch(/timed out/i)
        expect(describeAIError(new AIClientError('rate-limited', ''))).toMatch(/rate/i)
    })

    it('unknown code from a newer server → generic message, no leak', () => {
        const message = describeAIError(new AIClientError('brand-new-code' as AIClientErrorCode, LEAKY))

        expect(message).toBe('Something went wrong. Please retry.')
    })

    it('non-AI errors (TypeError with internals, strings, null) → generic, no leak', () => {
        expect(describeAIError(new TypeError(LEAKY))).toBe('Something went wrong. Please retry.')
        expect(describeAIError(LEAKY)).not.toContain('/opt/')
        expect(describeAIError(null)).toBe('Something went wrong. Please retry.')
    })
})
