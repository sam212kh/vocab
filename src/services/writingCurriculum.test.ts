import { describe, expect, it } from 'vitest'

import { buildWritingCurriculum, writingBandFor, writingStagesFor } from './writingCurriculum'
import type { WritingPrompt } from '../types/writing'

const prompt = (id: string, cefrLevel: string, difficulty: number, promptType: WritingPrompt['promptType'] = 'paragraph'): WritingPrompt => ({
    id,
    title: id,
    promptType,
    cefrLevel,
    difficulty,
    instructions: 'Write something.',
})

describe('writingCurriculum', () => {
    it('maps compound levels to their lowest authored band', () => {
        expect(writingBandFor('A2-B1')).toBe('A2')
        expect(writingBandFor('B1-B2')).toBe('B1')
        expect(writingBandFor(undefined)).toBeNull()
    })

    it('orders authored prompts by level and difficulty', () => {
        expect(buildWritingCurriculum([
            prompt('b1', 'B1', 2),
            prompt('a1', 'A1', 1),
            prompt('a2', 'A2', 1),
        ]).map(item => item.id)).toEqual(['a1', 'a2', 'b1'])
    })

    it('gives sentence work a guided-to-independent progression', () => {
        expect(writingStagesFor('sentence')).toEqual([
            'understand', 'vocabulary', 'structure', 'guided', 'independent', 'transfer',
        ])
    })
})
