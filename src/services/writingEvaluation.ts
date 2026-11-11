import { evaluateWriting } from './aiClient'

import { useAISettingsStore } from '../stores/aiSettings'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useMistakesStore } from '../stores/mistakes'

import type {
    DimensionFeedback,
    FollowUpExercise,
    SentenceFeedback,
    VocabularySuggestion,
    WritingEvaluation,
    WritingEvaluator,
    WritingPrompt,
} from '../types/writing'

/**
 * The real AI-backed WritingEvaluator. Builds minimal learner context from
 * the profile + recurring confirmed mistakes, sends it through the gateway,
 * and maps the validated response into the typed WritingEvaluation.
 *
 * The gateway already validates model output; the mapping here is defensive
 * anyway (the frontend must not trust network payloads blindly), but it
 * never invents content — missing optional parts become empty arrays.
 */
export function createAIWritingEvaluator(): WritingEvaluator {
    return {
        async evaluate(prompt: WritingPrompt, text: string): Promise<WritingEvaluation> {
            const settings = useAISettingsStore().settings
            const profile = useLearnerProfileStore().profile
            const mistakesStore = useMistakesStore()

            const explanationLanguage = resolveExplanationLanguage(
                settings.explanationLanguage,
                profile.explanationLanguage
            )

            const response = await evaluateWriting({
                text,
                task: prompt.instructions,
                provider: settings.provider,
                model: settings.model || undefined,
                detail: settings.feedbackDetail,
                explanationLanguage,
                allowFallback: settings.allowFallback,
                learner: {
                    nativeLanguage: profile.nativeLanguage,
                    selfReportedLevel: profile.selfReportedLevel ?? '',
                    levelSource: 'self-reported',
                    recurringMistakes: mistakesStore.recurringErrorCategories(5),
                },
            })

            const { evaluation, meta } = response

            return {
                provider: meta.provider,
                model: meta.model,
                promptVersion: meta.promptVersion,
                evaluatedAt: Date.now(),
                durationMs: meta.durationMs,
                fallbackUsed: meta.fallbackUsed,
                overall: evaluation.overall,
                correctedVersion: evaluation.correctedVersion,
                naturalVersion: evaluation.naturalVersion,
                dimensions: asArray<DimensionFeedback>(evaluation.dimensions),
                sentences: asArray<SentenceFeedback>(evaluation.sentences),
                vocabulary: asArray<VocabularySuggestion>(evaluation.vocabulary),
                priorities: Array.isArray(evaluation.priorities) ? evaluation.priorities : [],
                followUpExercises: asArray<FollowUpExercise>(evaluation.followUpExercises),
            }
        },
    }
}

/**
 * Map evaluation mistake categories onto the coarser PerformanceEvent
 * error-category vocabulary. Only confirmed errors count — style
 * suggestions are not performance failures.
 */
export function performanceCategoriesFromEvaluation(
    evaluation: WritingEvaluation
): ('grammar' | 'vocabulary' | 'spelling' | 'word-order' | 'task-constraints')[] {
    const categories = new Set<'grammar' | 'vocabulary' | 'spelling' | 'word-order' | 'task-constraints'>()

    for (const sentence of evaluation.sentences) {
        if (sentence.kind !== 'error') continue

        switch (sentence.category) {
            case 'spelling':
                categories.add('spelling')
                break
            case 'word-order':
                categories.add('word-order')
                break
            case 'word-choice':
            case 'collocation':
                categories.add('vocabulary')
                break
            default:
                categories.add('grammar')
        }
    }

    return [...categories]
}

function resolveExplanationLanguage(
    setting: 'persian' | 'english' | 'follow-profile',
    profileLanguage: 'persian' | 'english' | 'bilingual'
): 'persian' | 'english' | 'bilingual' {
    if (setting === 'persian') return 'persian'
    if (setting === 'english') return 'english'

    return profileLanguage
}

function asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : []
}
