import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./aiClient', async importOriginal => {
    const original = await importOriginal<typeof import('./aiClient')>()

    return {
        ...original,
        evaluateWriting: vi.fn(),
    }
})

import { evaluateWriting } from './aiClient'
import {
    createAIWritingEvaluator,
    performanceCategoriesFromEvaluation,
} from './writingEvaluation'
import { useAISettingsStore } from '../stores/aiSettings'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useMistakesStore } from '../stores/mistakes'

import type { SentenceFeedback, WritingEvaluation, WritingPrompt } from '../types/writing'

const evaluateWritingMock = vi.mocked(evaluateWriting)

beforeEach(() => {
    setActivePinia(createPinia())
    evaluateWritingMock.mockReset()
})

const PROMPT: WritingPrompt = {
    id: 'daily-journal',
    title: 'Daily Journal',
    promptType: 'journal',
    instructions: 'Write about your day.',
}

const GATEWAY_RESPONSE = {
    evaluation: {
        overall: 'Solid attempt.',
        correctedVersion: 'Corrected text.',
        naturalVersion: 'Natural text.',
        dimensions: [],
        sentences: [],
        vocabulary: [],
        priorities: [],
        followUpExercises: [],
    },
    meta: {
        provider: 'ollama',
        model: 'test-model',
        promptVersion: 'writing-evaluator-v1',
        durationMs: 1200,
        fallbackUsed: false,
        warnings: [],
    },
}

describe('createAIWritingEvaluator', () => {
    it('builds the request from settings + profile and maps the response', async () => {
        evaluateWritingMock.mockResolvedValue(GATEWAY_RESPONSE)

        useAISettingsStore().update({ provider: 'cloud', feedbackDetail: 'concise' })

        const result = await createAIWritingEvaluator().evaluate(PROMPT, 'My text.')

        const payload = evaluateWritingMock.mock.calls[0][0]

        expect(payload.provider).toBe('cloud')
        expect(payload.detail).toBe('concise')
        expect(payload.task).toBe('Write about your day.')
        expect(payload.learner.nativeLanguage).toBe('Persian')
        expect(payload.learner.levelSource).toBe('self-reported')

        expect(result.provider).toBe('ollama')
        expect(result.promptVersion).toBe('writing-evaluator-v1')
        expect(result.correctedVersion).toBe('Corrected text.')
        expect(result.evaluatedAt).toBeGreaterThan(0)
    })

    it('follow-profile explanation language resolves from the learner profile', async () => {
        evaluateWritingMock.mockResolvedValue(GATEWAY_RESPONSE)

        useLearnerProfileStore().update({ explanationLanguage: 'persian' })

        await createAIWritingEvaluator().evaluate(PROMPT, 'My text.')

        expect(evaluateWritingMock.mock.calls[0][0].explanationLanguage).toBe('persian')
    })

    it('passes recurring confirmed errors as context', async () => {
        evaluateWritingMock.mockResolvedValue(GATEWAY_RESPONSE)

        const mistakes = useMistakesStore()
        const sentence = (submissionId: string): [string, SentenceFeedback[]] => [
            submissionId,
            [{
                original: 'x', corrected: 'y', category: 'articles', kind: 'error',
                explanation: 'e', explanationPersian: '', example: '',
            }],
        ]
        mistakes.recordFromEvaluation(...sentence('a'))
        mistakes.recordFromEvaluation(...sentence('b'))

        await createAIWritingEvaluator().evaluate(PROMPT, 'My text.')

        expect(evaluateWritingMock.mock.calls[0][0].learner.recurringMistakes).toContain('articles')
    })

    it('propagates provider errors instead of fabricating feedback', async () => {
        evaluateWritingMock.mockRejectedValue(new Error('provider down'))

        await expect(
            createAIWritingEvaluator().evaluate(PROMPT, 'My text.')
        ).rejects.toThrow('provider down')
    })
})

describe('performanceCategoriesFromEvaluation', () => {
    function evaluation(sentences: Partial<SentenceFeedback>[]): WritingEvaluation {
        return {
            provider: 'ollama', model: 'm', promptVersion: 'v1', evaluatedAt: 1,
            durationMs: 1, fallbackUsed: false, overall: '', correctedVersion: '',
            naturalVersion: '', dimensions: [], vocabulary: [], priorities: [], followUpExercises: [],
            sentences: sentences.map(s => ({
                original: 'o', corrected: 'c', category: 'tense', kind: 'error',
                explanation: '', explanationPersian: '', example: '', ...s,
            })),
        }
    }

    it('maps mistake categories to performance categories, errors only', () => {
        const categories = performanceCategoriesFromEvaluation(evaluation([
            { category: 'tense', kind: 'error' },
            { category: 'spelling', kind: 'error' },
            { category: 'word-choice', kind: 'error' },
            { category: 'naturalness', kind: 'style' },
        ]))

        expect(categories).toContain('grammar')
        expect(categories).toContain('spelling')
        expect(categories).toContain('vocabulary')
        expect(categories).toHaveLength(3)
    })

    it('returns empty for an error-free evaluation', () => {
        expect(performanceCategoriesFromEvaluation(evaluation([]))).toEqual([])
    })
})
