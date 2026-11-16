import { AIClientError } from './aiClient'
import { describeAIError } from './aiErrorMessages'

import { SENTENCE_DIMENSIONS, SENTENCE_EVALUATION_SCHEMA } from '../types/sentenceEvaluation'
import type {
    SentenceError,
    SentenceEvaluation,
    SentenceEvaluationRequest,
} from '../types/sentenceEvaluation'
import type { ConstructionPrompt } from '../types/journey'
import type { GatewaySentenceEvaluationResponse } from './aiClient'

/**
 * Reusable sentence-production evaluation (client side).
 *
 * The gateway does the judging and validates the model; this module builds
 * requests, NEVER throws into the UI, and never fabricates an evaluation: when
 * the provider is unavailable the result says so and the caller falls back to
 * the deterministic length/target check, clearly labelled as basic.
 */

export { FIRST_ATTEMPT, classifyAssistance, normalizeSentence } from './productionAssistance'
export type { ProductionAttemptContext } from './productionAssistance'

/* ---------- request ---------- */

export interface SentenceRequestSettings {
    provider: 'ollama' | 'cloud'
    model: string
    allowFallback: boolean
    explanationLanguage: 'english' | 'persian' | 'bilingual'
    selfReportedLevel: string
}

export function buildSentenceRequest(
    prompt: ConstructionPrompt,
    learnerSentence: string,
    settings: SentenceRequestSettings
): SentenceEvaluationRequest {
    return {
        learnerSentence: learnerSentence.trim(),
        /* Journey construction prompts are open situational tasks: any valid
         * wording is acceptable; model sentences are examples, not answers. */
        taskType: 'open',
        promptPersian: prompt.promptPersian,
        promptEnglish: prompt.promptEnglish,
        targetExpressions: prompt.targetExpressions,
        referenceSentences: prompt.modelSentences,
        explanationLanguage: settings.explanationLanguage,
        provider: settings.provider,
        model: settings.model || undefined,
        allowFallback: settings.allowFallback,
        learner: { selfReportedLevel: settings.selfReportedLevel },
    }
}

/* ---------- guarded shape check (defence in depth against a mismatched gateway) ---------- */

export function isSentenceEvaluation(value: unknown): value is SentenceEvaluation {
    if (!value || typeof value !== 'object') return false

    const candidate = value as Partial<SentenceEvaluation>

    return (
        candidate.schemaVersion === SENTENCE_EVALUATION_SCHEMA &&
        typeof candidate.learnerSentence === 'string' &&
        typeof candidate.outcome === 'string' &&
        typeof candidate.passed === 'boolean' &&
        Array.isArray(candidate.issues) &&
        Array.isArray(candidate.errors) &&
        !!candidate.dimensions &&
        SENTENCE_DIMENSIONS.every(key => !!candidate.dimensions?.[key]) &&
        !!candidate.content &&
        !!candidate.language
    )
}

/* ---------- orchestration (never throws; never fabricates) ---------- */

export type SentenceEvaluationResult =
    | { source: 'ai'; evaluation: SentenceEvaluation; provider: string; model: string; fallbackUsed: boolean }
    | { source: 'unavailable'; code: string; message: string }
    | { source: 'rejected'; reason: 'empty' }

export type SentenceEvaluator = (request: SentenceEvaluationRequest) => Promise<GatewaySentenceEvaluationResponse>

export async function requestSentenceEvaluation(
    evaluate: SentenceEvaluator,
    request: SentenceEvaluationRequest
): Promise<SentenceEvaluationResult> {
    if (!request.learnerSentence.trim()) return { source: 'rejected', reason: 'empty' }

    try {
        const response = await evaluate(request)

        if (!isSentenceEvaluation(response?.evaluation)) {
            return { source: 'unavailable', code: 'invalid-model-output', message: describeAIError(new AIClientError('invalid-model-output', '')) }
        }

        return {
            source: 'ai',
            evaluation: response.evaluation,
            provider: response.meta?.provider ?? 'unknown',
            model: response.meta?.model ?? 'unknown',
            fallbackUsed: response.meta?.fallbackUsed === true,
        }
    } catch (err) {
        return {
            source: 'unavailable',
            code: err instanceof AIClientError ? err.code : 'unknown',
            message: describeAIError(err),
        }
    }
}

/* ---------- presentation helpers (pure) ---------- */

export interface SentenceSegment {
    text: string
    /** Set when this slice is a located error (for highlighting). */
    error: SentenceError | null
}

/** Splits the learner's exact sentence into plain / error-highlighted slices. */
export function segmentLearnerSentence(sentence: string, errors: SentenceError[]): SentenceSegment[] {
    const located = errors
        .filter(error => error.start !== null && error.end !== null && error.end > error.start)
        .filter(error => sentence.slice(error.start!, error.end!).length > 0)
        .sort((a, b) => a.start! - b.start!)

    const segments: SentenceSegment[] = []
    let cursor = 0

    for (const error of located) {
        if (error.start! < cursor) continue

        if (error.start! > cursor) segments.push({ text: sentence.slice(cursor, error.start!), error: null })

        segments.push({ text: sentence.slice(error.start!, error.end!), error })
        cursor = error.end!
    }

    if (cursor < sentence.length) segments.push({ text: sentence.slice(cursor), error: null })

    return segments.length ? segments : [{ text: sentence, error: null }]
}

/** Primary problem first (language errors before whole-sentence notes); capped to keep feedback short. */
export function primaryErrors(evaluation: SentenceEvaluation, limit = 2): SentenceError[] {
    const rank = (error: SentenceError) => (error.fragment ? 0 : 1)

    return [...evaluation.errors].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}
