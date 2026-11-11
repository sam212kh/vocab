import {
    assistWithMessage,
    sendConversationTurn,
    summarizeConversation,
} from './aiClient'

import { useAISettingsStore } from '../stores/aiSettings'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useMistakesStore } from '../stores/mistakes'

import type { ChatPayload } from './aiClient'
import type {
    ConversationCorrection,
    ConversationMessage,
    ConversationSession,
    ConversationSummary,
    RoleplayScenario,
} from '../types/conversation'
import type { MistakeCategory, MistakeKind } from '../types/writing'

/**
 * Conversation orchestration: builds gateway payloads from learner context
 * (same minimal-context discipline as the writing evaluator), maps
 * validated gateway responses into typed structures. Components never see
 * provider formats.
 */

/** Client-side context window — must not exceed the gateway's own cap. */
const CONTEXT_MESSAGES = 16

function resolveExplanationLanguage(): 'english' | 'persian' | 'bilingual' {
    const setting = useAISettingsStore().settings.explanationLanguage

    if (setting === 'persian') return 'persian'
    if (setting === 'english') return 'english'

    return useLearnerProfileStore().profile.explanationLanguage
}

function buildBasePayload(
    session: ConversationSession,
    scenario: RoleplayScenario | null
): Omit<ChatPayload, 'messages' | 'feedbackMode'> {
    const settings = useAISettingsStore().settings
    const profile = useLearnerProfileStore().profile
    const mistakes = useMistakesStore()

    return {
        mode: session.mode,
        scenario: scenario
            ? {
                title: scenario.title,
                aiRole: scenario.aiRole,
                learnerRole: scenario.learnerRole,
                objective: scenario.objective,
                context: scenario.context,
                vocabulary: scenario.vocabulary,
            }
            : null,
        difficulty: session.difficulty,
        explanationLanguage: resolveExplanationLanguage(),
        provider: settings.provider,
        model: settings.model || undefined,
        allowFallback: settings.allowFallback,
        learner: {
            nativeLanguage: profile.nativeLanguage,
            interests: profile.interests.slice(0, 5),
            goals: profile.goals.slice(0, 4).map(goal => goal.type),
            recurringMistakes: mistakes.recurringErrorCategories(5),
        },
    }
}

function toPayloadMessages(messages: ConversationMessage[]): ChatPayload['messages'] {
    return messages
        .slice(-CONTEXT_MESSAGES)
        .map(message => ({ role: message.role, text: message.text }))
}

function mapCorrection(raw: unknown): ConversationCorrection | null {
    if (!raw || typeof raw !== 'object') return null

    const item = raw as Record<string, unknown>

    if (typeof item.original !== 'string' || typeof item.corrected !== 'string') return null

    return {
        original: item.original,
        corrected: item.corrected,
        natural: typeof item.natural === 'string' ? item.natural : '',
        category: (item.category as MistakeCategory) ?? 'other',
        kind: item.kind === 'error' ? 'error' : 'style',
        explanation: typeof item.explanation === 'string' ? item.explanation : '',
        explanationPersian: typeof item.explanationPersian === 'string' ? item.explanationPersian : '',
        example: typeof item.example === 'string' ? item.example : '',
    }
}

export interface TurnResult {
    reply: string
    corrections: ConversationCorrection[]
    provider: string
    fallbackUsed: boolean
}

export async function requestTutorTurn(
    session: ConversationSession,
    scenario: RoleplayScenario | null
): Promise<TurnResult> {
    const response = await sendConversationTurn({
        ...buildBasePayload(session, scenario),
        messages: toPayloadMessages(session.messages),
        feedbackMode: session.feedbackMode,
    })

    return {
        reply: response.reply,
        corrections: response.corrections
            .map(mapCorrection)
            .filter((item): item is ConversationCorrection => item !== null),
        provider: response.meta.provider,
        fallbackUsed: response.meta.fallbackUsed,
    }
}

export async function requestSessionSummary(
    session: ConversationSession,
    scenario: RoleplayScenario | null
): Promise<ConversationSummary> {
    const response = await summarizeConversation({
        ...buildBasePayload(session, scenario),
        messages: toPayloadMessages(session.messages),
    })

    const summary = response.summary

    return {
        overall: summary.overall,
        strengths: summary.strengths,
        improvements: summary.improvements,
        corrections: summary.corrections
            .map(mapCorrection)
            .filter((item): item is ConversationCorrection => item !== null)
            .map(({ natural: _natural, example: _example, ...rest }) => rest),
        usefulExpressions: (summary.usefulExpressions as Record<string, string>[])
            .filter(item => item && typeof item.expression === 'string')
            .map(item => ({
                expression: item.expression,
                meaning: item.meaning ?? '',
                meaningPersian: item.meaningPersian ?? '',
            })),
        suggestedNextActivity: summary.suggestedNextActivity,
        provider: response.meta.provider,
        model: response.meta.model,
        promptVersion: response.meta.promptVersion,
        generatedAt: Date.now(),
    }
}

export async function requestAssist(
    kind: 'translate' | 'explain' | 'simplify' | 'correct',
    text: string
): Promise<string> {
    const settings = useAISettingsStore().settings

    const response = await assistWithMessage({
        kind,
        text,
        explanationLanguage: resolveExplanationLanguage(),
        provider: settings.provider,
        model: settings.model || undefined,
        allowFallback: settings.allowFallback,
    })

    return response.reply
}

/** Map a correction's category onto PerformanceEvent error categories. */
export function performanceCategoryFor(
    correction: ConversationCorrection
): 'grammar' | 'vocabulary' | 'spelling' | 'word-order' {
    switch (correction.category) {
        case 'spelling':
            return 'spelling'
        case 'word-order':
            return 'word-order'
        case 'word-choice':
        case 'collocation':
            return 'vocabulary'
        default:
            return 'grammar'
    }
}

export type { MistakeKind }
