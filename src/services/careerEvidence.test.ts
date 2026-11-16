import { describe, expect, it } from 'vitest'

import { evidenceForInterviewAnswer, hasContentWeakness } from './careerEvidence'

import type { InterviewAnswerEvaluation } from './aiClient'

function evaluation(overrides: Partial<InterviewAnswerEvaluation> = {}): InterviewAnswerEvaluation {
    return {
        overall: 'ok',
        correctedAnswer: 'x',
        professionalVersion: 'y',
        dimensions: [],
        languageIssues: [],
        alternativeExpressions: [],
        contentSuggestions: [],
        followUpPractice: [],
        ...overrides,
    }
}

const ISSUE = { original: 'I am work here', corrected: 'I work here', category: 'tense', explanation: 'x', explanationPersian: '' }

describe('evidenceForInterviewAnswer', () => {
    it('typed answers NEVER create speaking evidence', () => {
        const events = evidenceForInterviewAnswer({
            questionId: 'gen-01', answerMode: 'text', voiceConfidence: null, evaluation: evaluation(),
        })

        expect(events.some(event => event.skill === 'speaking')).toBe(false)
    })

    it('voice answers create exactly one speaking event with recognizer confidence', () => {
        const events = evidenceForInterviewAnswer({
            questionId: 'gen-01', answerMode: 'voice', voiceConfidence: 0.82, evaluation: evaluation(),
        })

        const speaking = events.filter(event => event.skill === 'speaking')

        expect(speaking).toHaveLength(1)
        expect(speaking[0].confidence).toBe(0.82)
    })

    it('language issues produce an incorrect grammar event; a clean answer produces a correct one', () => {
        const withIssue = evidenceForInterviewAnswer({
            questionId: 'q', answerMode: 'text', voiceConfidence: null,
            evaluation: evaluation({ languageIssues: [ISSUE] }),
        })
        const clean = evidenceForInterviewAnswer({
            questionId: 'q', answerMode: 'text', voiceConfidence: null, evaluation: evaluation(),
        })

        expect(withIssue.find(e => e.skill === 'grammar')!.result).toBe('incorrect')
        expect(clean.find(e => e.skill === 'grammar')!.result).toBe('correct')
    })

    it('content weaknesses alone (a short or thin answer) do NOT count as language errors', () => {
        const events = evidenceForInterviewAnswer({
            questionId: 'q', answerMode: 'text', voiceConfidence: null,
            evaluation: evaluation({
                contentSuggestions: ['Add a concrete example', 'State the result'],
                dimensions: [{ dimension: 'structure', kind: 'content', assessment: 'Thin', suggestion: 'Use STAR' }],
            }),
        })

        expect(events.find(e => e.skill === 'grammar')!.result).toBe('correct')
        expect(hasContentWeakness(evaluation({ contentSuggestions: ['Add an example'] }))).toBe(true)
    })

    it('hasContentWeakness is false for a fully clean evaluation', () => {
        expect(hasContentWeakness(evaluation())).toBe(false)
    })
})
