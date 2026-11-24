import { describe, expect, it } from 'vitest'

import { serializeLearnerContext } from './learnerContext'

describe('learner context serialization', () => {
    it('keeps the coach payload bounded and structured', () => {
        const context = {
            level: { value: 'B1' as const, source: 'self-reported' as const },
            goals: ['speaking'], interests: [], explanationLanguage: 'bilingual',
            recentlyLearned: [], independentlyRecalled: [], dueForReview: [],
            recurringMistakes: [], communication: [], recentConversationThemes: [],
        }
        const parsed = JSON.parse(serializeLearnerContext(context))
        expect(parsed.level.value).toBe('B1')
        expect(serializeLearnerContext(context).length).toBeLessThanOrEqual(9000)
    })
})
