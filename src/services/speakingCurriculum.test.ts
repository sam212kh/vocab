import { describe, expect, it } from 'vitest'

import { buildSpeakingCurriculum, speakingBandFor, speakingStepKinds } from './speakingCurriculum'
import type { SpeakingTopic } from '../types/speaking'

const topic = (id: string, cefrLevel: string, difficulty: number): SpeakingTopic => ({
    id,
    title: id,
    cefrLevel,
    difficulty,
    steps: [
        { kind: 'repeat', prompt: 'Repeat this.' },
        { kind: 'open', prompt: 'Answer this.' },
    ],
})

describe('speakingCurriculum', () => {
    it('maps compound levels to their lowest authored band', () => {
        expect(speakingBandFor('A2-B1')).toBe('A2')
        expect(speakingBandFor('B1-B2')).toBe('B1')
        expect(speakingBandFor('unknown')).toBeNull()
    })

    it('orders existing topics from beginner to advanced without inventing content', () => {
        const topics = [topic('b1', 'B1', 1), topic('a1', 'A1', 2), topic('a2', 'A2', 1)]
        expect(buildSpeakingCurriculum(topics).map(item => item.id)).toEqual(['a1', 'a2', 'b1'])
    })

    it('describes the existing teach-then-produce step balance', () => {
        expect(speakingStepKinds(topic('intro', 'A1', 1))).toEqual({ repeat: 1, open: 1 })
    })
})
