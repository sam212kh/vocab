import { afterEach, describe, expect, it, vi } from 'vitest'

import { AIClientError, evaluateWriting, fetchAIProviders } from './aiClient'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as Response
}

afterEach(() => {
    vi.unstubAllGlobals()
})

const PAYLOAD = {
    text: 'Hello world.',
    task: 'Write a greeting.',
    detail: 'standard' as const,
    explanationLanguage: 'bilingual' as const,
    allowFallback: false,
    learner: {
        nativeLanguage: 'Persian',
        selfReportedLevel: 'B1',
        levelSource: 'self-reported' as const,
        recurringMistakes: [],
    },
}

describe('aiClient', () => {
    it('returns the gateway evaluation payload on success', async () => {
        const body = {
            evaluation: {
                overall: 'Good.', correctedVersion: 'Hello world.', naturalVersion: 'Hello world.',
                dimensions: [], sentences: [], vocabulary: [], priorities: [], followUpExercises: [],
            },
            meta: { provider: 'ollama', model: 'm', promptVersion: 'writing-evaluator-v1', durationMs: 5, fallbackUsed: false, warnings: [] },
        }

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

        const result = await evaluateWriting(PAYLOAD)

        expect(result.meta.promptVersion).toBe('writing-evaluator-v1')
        expect(result.evaluation.correctedVersion).toBe('Hello world.')
    })

    it('maps gateway error codes onto AIClientError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse({ error: 'Ollama is down', code: 'unreachable', provider: 'ollama' }, false, 503)
        ))

        try {
            await evaluateWriting(PAYLOAD)
            expect.unreachable('should have thrown')
        } catch (error) {
            expect(error).toBeInstanceOf(AIClientError)
            expect((error as AIClientError).code).toBe('unreachable')
            expect((error as AIClientError).provider).toBe('ollama')
        }
    })

    it('maps network failure to gateway-unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

        await expect(evaluateWriting(PAYLOAD)).rejects.toMatchObject({ code: 'gateway-unreachable' })
    })

    it('treats an incomplete success payload as invalid-model-output', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ evaluation: null })))

        await expect(evaluateWriting(PAYLOAD)).rejects.toMatchObject({ code: 'invalid-model-output' })
    })

    it('fetchAIProviders surfaces gateway failures as typed errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 502)))

        await expect(fetchAIProviders()).rejects.toBeInstanceOf(AIClientError)
    })
})
