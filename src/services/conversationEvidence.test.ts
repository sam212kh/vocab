import { describe, expect, it } from 'vitest'

import { evidenceForTurn } from './conversationEvidence'

import type { ConversationCorrection } from '../types/conversation'

function correction(overrides: Partial<ConversationCorrection> = {}): ConversationCorrection {
    return {
        original: 'I am working here since five years.',
        corrected: 'I have been working here for five years.',
        natural: '',
        category: 'tense',
        kind: 'error',
        explanation: 'x',
        explanationPersian: '',
        example: '',
        ...overrides,
    }
}

const BASE = {
    mode: 'professional' as const,
    scenarioId: null,
    feedbackMode: 'gentle' as const,
    inputMethod: 'text' as const,
    voiceConfidence: null,
    corrections: [],
}

describe('evidenceForTurn (performance gating)', () => {
    it('typed text NEVER creates a speaking event', () => {
        const events = evidenceForTurn({ ...BASE, corrections: [correction()] })

        expect(events.some(event => event.skill === 'speaking')).toBe(false)
    })

    it('voice input creates exactly one speaking event with recognizer confidence', () => {
        const events = evidenceForTurn({
            ...BASE,
            inputMethod: 'voice',
            voiceConfidence: 0.87,
        })

        const speaking = events.filter(event => event.skill === 'speaking')

        expect(speaking).toHaveLength(1)
        expect(speaking[0].confidence).toBe(0.87)
    })

    it('natural mode (no feedback) produces no correctness events — no evidence, no claim', () => {
        const events = evidenceForTurn({
            ...BASE,
            feedbackMode: 'natural',
            corrections: [],
        })

        expect(events).toHaveLength(0)
    })

    it('natural mode with voice still records ONLY the speaking event', () => {
        const events = evidenceForTurn({
            ...BASE,
            feedbackMode: 'natural',
            inputMethod: 'voice',
            voiceConfidence: 0.9,
        })

        expect(events).toHaveLength(1)
        expect(events[0].skill).toBe('speaking')
    })

    it('error corrections produce an incorrect event with mapped categories', () => {
        const events = evidenceForTurn({
            ...BASE,
            corrections: [
                correction({ category: 'tense' }),
                correction({ category: 'word-choice', original: 'other phrase here' }),
            ],
        })

        const graded = events.find(event => event.skill !== 'speaking')!

        expect(graded.result).toBe('incorrect')
        expect(graded.errorCategories).toEqual(['grammar', 'vocabulary'])
    })

    it('style-only corrections count as a clean (correct) message, not an error', () => {
        const events = evidenceForTurn({
            ...BASE,
            feedbackMode: 'teacher',
            corrections: [correction({ kind: 'style', category: 'naturalness' })],
        })

        const graded = events.find(event => event.skill !== 'speaking')!

        expect(graded.result).toBe('correct')
        expect(graded.errorCategories).toEqual([])
    })

    it('vocabulary-dominant errors are attributed to the vocabulary skill', () => {
        const events = evidenceForTurn({
            ...BASE,
            corrections: [correction({ category: 'collocation' })],
        })

        expect(events[0].skill).toBe('vocabulary')
    })
})
