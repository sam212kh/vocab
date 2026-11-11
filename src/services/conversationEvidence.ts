import { performanceCategoryFor } from './conversationService'

import type { RecordPerformanceInput } from '../stores/performance'
import type {
    ConversationCorrection,
    ConversationMode,
    FeedbackMode,
} from '../types/conversation'

export interface TurnEvidenceInput {
    mode: ConversationMode
    scenarioId: string | null
    feedbackMode: FeedbackMode
    inputMethod: 'text' | 'voice'
    voiceConfidence: number | null
    corrections: ConversationCorrection[]
}

/**
 * Decide which performance events ONE learner conversation turn justifies.
 * Pure — the view feeds the result to the performance store.
 *
 * Rules (the honesty contract from the Phase 5 spec):
 * - Speaking events ONLY for voice input. Typed text never counts as
 *   spoken performance.
 * - Correctness events ONLY when a feedback mode produced evidence
 *   (gentle/teacher). Mode A gives no feedback → no evidence → no events.
 * - Error events carry the mapped error categories; a reviewed message
 *   with zero error corrections is one correct event.
 */
export function evidenceForTurn(input: TurnEvidenceInput): RecordPerformanceInput[] {
    const events: RecordPerformanceInput[] = []

    const activityId = `conversation-${input.mode}`

    if (input.inputMethod === 'voice') {
        events.push({
            skill: 'speaking',
            activityId,
            lessonId: input.scenarioId,
            result: 'correct',
            confidence: input.voiceConfidence,
        })
    }

    if (input.feedbackMode !== 'natural') {
        const errorCorrections = input.corrections.filter(item => item.kind === 'error')

        events.push({
            skill: errorCorrections.length && performanceCategoryFor(errorCorrections[0]) === 'vocabulary'
                ? 'vocabulary'
                : 'grammar',
            activityId,
            lessonId: input.scenarioId,
            result: errorCorrections.length ? 'incorrect' : 'correct',
            errorCategories: errorCorrections.map(performanceCategoryFor),
        })
    }

    return events
}
