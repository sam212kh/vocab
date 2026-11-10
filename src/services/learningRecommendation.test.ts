import { describe, expect, it } from 'vitest'

import { buildDailyRecommendation } from './learningRecommendation'

import type { SkillPerformanceSummary } from '../types/performance'

function summary(overrides: Partial<SkillPerformanceSummary> & { skill: SkillPerformanceSummary['skill'] }): SkillPerformanceSummary {
    return {
        totalEvents: 0,
        correct: 0,
        incorrect: 0,
        accuracy: 0,
        repeatedMistakes: [],
        lastActivityAt: null,
        ...overrides,
    }
}

describe('buildDailyRecommendation', () => {
    it('always leads with the daily session when there is time budget', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 45,
            dueWordsCount: 0,
            hardWordsCount: 0,
            goals: [],
        })

        expect(recommendation.activities[0].type).toBe('daily-session')
    })

    it('explains the daily session reason differently when words are due vs not', () => {
        const withDue = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 5, hardWordsCount: 0, goals: [],
        })
        const withoutDue = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 0, hardWordsCount: 0, goals: [],
        })

        expect(withDue.activities[0].reason).toContain('5 words due')
        expect(withoutDue.activities[0].reason).toContain('No words due')
    })

    it('recommends grammar review when grammar topics are due, naming them', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 45,
            dueWordsCount: 0,
            hardWordsCount: 0,
            goals: [],
            dueGrammarTopics: ['present-perfect', 'articles'],
        })

        const review = recommendation.activities.find(a => a.type === 'grammar-review')

        expect(review).toBeDefined()
        expect(review!.reason).toContain('present-perfect')
    })

    it('recommends revisiting a skill with repeated mistakes, with an explanation', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 45,
            dueWordsCount: 0,
            hardWordsCount: 0,
            goals: [],
            skillSummaries: [
                summary({ skill: 'listening', totalEvents: 6, incorrect: 4, repeatedMistakes: ['dictation-3', 'doctor-2'] }),
            ],
        })

        const listening = recommendation.activities.find(a => a.skill === 'listening')

        expect(listening).toBeDefined()
        expect(listening!.reason).toContain('wrong more than once')
    })

    it('flags a weak skill only when there is enough observed data', () => {
        const notEnoughData = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 0, hardWordsCount: 0, goals: [],
            skillSummaries: [
                summary({ skill: 'reading', totalEvents: 5, accuracy: 40 }),
            ],
        })

        const enoughData = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 0, hardWordsCount: 0, goals: [],
            skillSummaries: [
                summary({ skill: 'reading', totalEvents: 20, accuracy: 40 }),
            ],
        })

        expect(notEnoughData.activities.some(a => a.skill === 'reading')).toBe(false)
        expect(enoughData.activities.some(a => a.skill === 'reading')).toBe(true)
        expect(enoughData.activities.find(a => a.skill === 'reading')!.reason).toContain('40%')
    })

    it('adds guided speaking when speaking is a stated goal and time remains', () => {
        const withGoal = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 0, hardWordsCount: 0, goals: ['speaking'],
        })
        const withoutGoal = buildDailyRecommendation({
            studyDurationMinutes: 45, dueWordsCount: 0, hardWordsCount: 0, goals: ['writing'],
        })

        expect(withGoal.activities.some(a => a.type === 'guided-speaking')).toBe(true)
        expect(withoutGoal.activities.some(a => a.type === 'guided-speaking')).toBe(false)
        expect(withoutGoal.activities.some(a => a.type === 'writing-practice')).toBe(true)
    })

    it('does not recommend the same skill twice in one day', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 60,
            dueWordsCount: 3,
            hardWordsCount: 0,
            goals: ['vocabulary', 'grammar'],
            dueGrammarTopics: ['articles'],
            skillSummaries: [
                summary({ skill: 'grammar', totalEvents: 20, accuracy: 50, repeatedMistakes: ['articles-2', 'articles-4'] }),
            ],
        })

        const grammarActivities = recommendation.activities.filter(a => a.skill === 'grammar')

        expect(grammarActivities).toHaveLength(1)
    })

    it('adds hard-words review only when hard words exist and time remains', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 60, dueWordsCount: 0, hardWordsCount: 3, goals: [],
        })

        expect(recommendation.activities.some(a => a.type === 'hard-words-review')).toBe(true)
    })

    it('never allocates more total minutes than the study duration', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 15,
            dueWordsCount: 10,
            hardWordsCount: 10,
            goals: ['speaking', 'grammar', 'writing'],
            dueGrammarTopics: ['a', 'b'],
            skillSummaries: [
                summary({ skill: 'listening', totalEvents: 30, accuracy: 30 }),
            ],
        })

        expect(recommendation.totalEstimatedMinutes).toBeLessThanOrEqual(15)
    })

    it('is deterministic for the same input', () => {
        const input = {
            studyDurationMinutes: 45,
            dueWordsCount: 3,
            hardWordsCount: 2,
            goals: ['speaking' as const],
            dueGrammarTopics: ['articles'],
        }

        const a = buildDailyRecommendation(input)
        const b = buildDailyRecommendation(input)

        expect(a.activities).toEqual(b.activities)
        expect(a.totalEstimatedMinutes).toEqual(b.totalEstimatedMinutes)
    })

    it('every recommended activity carries a non-empty explanation', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 60,
            dueWordsCount: 4,
            hardWordsCount: 2,
            goals: ['speaking', 'listening', 'grammar'],
            dueGrammarTopics: ['articles'],
        })

        for (const activity of recommendation.activities) {
            expect(activity.reason.length).toBeGreaterThan(10)
        }
    })

    it('derives one objective per distinct skill implied by the stated goals, deduplicated', () => {
        const recommendation = buildDailyRecommendation({
            studyDurationMinutes: 45,
            dueWordsCount: 0,
            hardWordsCount: 0,
            goals: ['speaking', 'professional-english', 'travel-english'],
        })

        expect(recommendation.objectives).toHaveLength(1)
        expect(recommendation.objectives[0].skill).toBe('speaking')
    })
})
