import { describe, expect, it } from 'vitest'

import { guidedStepStatuses, eligibleForMeaningRecall, lessonComplete, nextGuidedStep } from './guidedLearning'

import type { ItemSummary } from '../types/evidence'
import type { Word, WordProgress } from '../types/vocabulary'

const word = (overrides: Partial<Word> = {}): Word => ({
    courseId: 'course', lessonId: 'lesson', word: 'approach', meaning: 'رویکرد', level: 'B1', pos: 'noun',
    synonyms: [{ word: 'method', meaning: 'روش' }], examples: [], miniContext: '', ...overrides,
})

const progress = (wordId: string): WordProgress => ({
    wordId, courseId: 'course', lessonId: 'lesson', status: 'learning', level: 1,
    pos: 'noun', correctAnswers: 1, wrongAnswers: 0, streak: 1, lastReviewedAt: Date.now(),
    nextReviewAt: null, practicePriority: 0, easeFactor: 2.5, intervalDays: 1,
})

const summary = (contexts: string[]): ItemSummary => ({
    key: 'lex:approach', kind: 'word', ladderStage: 'exposed', stage: 'exposed',
    stages: { exposed: { satisfied: true, qualifyingSuccesses: 0, distinctDays: 1, distinctContexts: 1, missing: [] }, recognized: { satisfied: false, qualifyingSuccesses: 0, distinctDays: 0, distinctContexts: 0, missing: [] }, recalled: { satisfied: false, qualifyingSuccesses: 0, distinctDays: 0, distinctContexts: 0, missing: [] }, produced: { satisfied: false, qualifyingSuccesses: 0, distinctDays: 0, distinctContexts: 0, missing: [] }, applied: { satisfied: false, qualifyingSuccesses: 0, distinctDays: 0, distinctContexts: 0, missing: [] } },
    evidenceCount: contexts.length, lastObservedAt: Date.now(), firstSeenAt: Date.now(), independentSuccesses: 0,
    assistedSuccesses: 0, unverifiedSuccesses: 0, confidence: 0, strength: 'insufficient', conflicting: false,
    contradicted: false, recent: { attempts: 0, successes: 0 }, historical: { attempts: 0, successes: 0 }, longestRetainedDays: null,
    history: contexts.map(ctx => ({ t: Date.now(), mode: 'recall', ok: true, independent: true, verified: true, ctx })),
})

describe('guidedLearning', () => {
    it('only adds Meaning Recall when verified data contains multiple meanings', () => {
        expect(eligibleForMeaningRecall([word()])).toHaveLength(1)
        expect(eligibleForMeaningRecall([word({ synonyms: [] })])).toHaveLength(0)
    })

    it('keeps the lesson sequence ordered and distinguishes completion from exposure', () => {
        const words = [word()]
        const none = guidedStepStatuses(words, [], () => null)
        expect(nextGuidedStep(none)?.id).toBe('learn')
        expect(lessonComplete(none)).toBe(false)

        const learned = guidedStepStatuses(words, [], () => summary([]))
        expect(nextGuidedStep(learned)?.id).toBe('practice')

        const practiced = guidedStepStatuses(words, [progress('approach')], () => summary([]))
        expect(nextGuidedStep(practiced)?.id).toBe('meaning-recall')

        const recalled = guidedStepStatuses(words, [progress('approach')], () => summary(['meaning-recall']))
        expect(nextGuidedStep(recalled)).toBeNull()
        expect(lessonComplete(recalled)).toBe(true)
    })
})

