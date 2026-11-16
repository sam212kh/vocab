import type { RecordPerformanceInput } from '../stores/performance'
import type { InterviewAnswerEvaluation } from './aiClient'

export interface InterviewEvidenceInput {
    questionId: string
    answerMode: 'text' | 'voice'
    voiceConfidence: number | null
    evaluation: InterviewAnswerEvaluation
}

/**
 * Which performance events one evaluated interview answer justifies.
 * Pure + unit-tested — same honesty contract as conversationEvidence:
 *
 * - Speaking evidence ONLY when the answer came from speech input. A typed
 *   answer never counts as speaking.
 * - Language correctness is graded from LANGUAGE issues only. Content
 *   weaknesses (structure, relevance, a short answer) are not language
 *   errors and never produce 'incorrect' language events.
 */
export function evidenceForInterviewAnswer(input: InterviewEvidenceInput): RecordPerformanceInput[] {
    const events: RecordPerformanceInput[] = []

    const activityId = `career-${input.questionId}`

    if (input.answerMode === 'voice') {
        events.push({
            skill: 'speaking',
            activityId,
            lessonId: input.questionId,
            result: 'correct',
            confidence: input.voiceConfidence,
        })
    }

    const issues = input.evaluation.languageIssues

    events.push({
        skill: 'grammar',
        activityId,
        lessonId: input.questionId,
        result: issues.length ? 'incorrect' : 'correct',
        errorCategories: issues.length ? ['grammar'] : [],
    })

    return events
}

/** True when at least one content (not language) improvement was suggested. */
export function hasContentWeakness(evaluation: InterviewAnswerEvaluation): boolean {
    return evaluation.contentSuggestions.length > 0 ||
        evaluation.dimensions.some(dim => dim.kind === 'content' && dim.suggestion.trim().length > 0)
}
