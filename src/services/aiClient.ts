/**
 * Thin typed client for the AI gateway (ai-service/). The only place the
 * frontend talks to AI infrastructure — Vue components and evaluators never
 * see provider-specific request formats.
 */

export interface AIProviderStatus {
    id: 'ollama' | 'cloud'
    configured: boolean
    available: boolean
    detail: string | null
    defaultModel: string | null
    models: string[]
    installedModels: string[] | null
}

export interface AIProvidersResponse {
    defaultProvider: string
    fallbackProvider: string | null
    providers: AIProviderStatus[]
}

export interface EvaluateWritingPayload {
    text: string
    task: string
    provider?: 'ollama' | 'cloud'
    model?: string
    detail: 'concise' | 'standard' | 'detailed'
    explanationLanguage: 'english' | 'persian' | 'bilingual'
    allowFallback: boolean
    learner: {
        nativeLanguage: string
        selfReportedLevel: string
        levelSource: 'self-reported' | 'verified'
        recurringMistakes: string[]
    }
}

/** Raw gateway success shape; mapped into WritingEvaluation by the caller. */
export interface GatewayEvaluationResponse {
    evaluation: {
        overall: string
        correctedVersion: string
        naturalVersion: string
        dimensions: unknown[]
        sentences: unknown[]
        vocabulary: unknown[]
        priorities: string[]
        followUpExercises: unknown[]
    }
    meta: {
        provider: string
        model: string
        promptVersion: string
        durationMs: number
        fallbackUsed: boolean
        warnings: string[]
    }
}

export type AIClientErrorCode =
    | 'unreachable'
    | 'timeout'
    | 'model-unavailable'
    | 'auth'
    | 'rate-limited'
    | 'provider-error'
    | 'empty-response'
    | 'invalid-model-output'
    | 'bad-request'
    | 'gateway-unreachable'

export class AIClientError extends Error {
    code: AIClientErrorCode
    provider: string | null

    constructor(code: AIClientErrorCode, message: string, provider: string | null = null) {
        super(message)
        this.code = code
        this.provider = provider
    }
}

const BASE_URL = '/api/ai'

/** Generous — local models are slow; the gateway enforces its own timeout too. */
const CLIENT_TIMEOUT_MS = 150000

async function request(path: string, init?: RequestInit, timeoutMs = CLIENT_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        return await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AIClientError('timeout', 'The AI request timed out.')
        }

        throw new AIClientError('gateway-unreachable', 'The AI service is not reachable. Is it running?')
    } finally {
        clearTimeout(timer)
    }
}

export async function fetchAIProviders(): Promise<AIProvidersResponse> {
    const response = await request('/providers', undefined, 15000)

    if (!response.ok) {
        throw new AIClientError('gateway-unreachable', `AI service returned HTTP ${response.status}`)
    }

    return (await response.json()) as AIProvidersResponse
}

export async function checkAIHealth(): Promise<boolean> {
    try {
        const response = await request('/health', undefined, 5000)
        return response.ok
    } catch {
        return false
    }
}

export interface ChatPayloadMessage {
    role: 'learner' | 'tutor'
    text: string
}

export interface ChatPayload {
    messages: ChatPayloadMessage[]
    mode: string
    scenario?: {
        title: string
        aiRole: string
        learnerRole: string
        objective: string
        context: string
        vocabulary?: string[]
    } | null
    difficulty: string
    feedbackMode: 'natural' | 'gentle' | 'teacher'
    explanationLanguage: 'english' | 'persian' | 'bilingual'
    provider?: 'ollama' | 'cloud'
    model?: string
    allowFallback: boolean
    learner: {
        nativeLanguage: string
        interests: string[]
        goals: string[]
        recurringMistakes: string[]
    }
}

export interface GatewayChatResponse {
    reply: string
    corrections: unknown[]
    meta: GatewayEvaluationResponse['meta']
}

export interface GatewaySummaryResponse {
    summary: {
        overall: string
        strengths: string[]
        improvements: string[]
        corrections: unknown[]
        usefulExpressions: unknown[]
        suggestedNextActivity: string
    }
    meta: GatewayEvaluationResponse['meta']
}

async function postJson<T>(path: string, payload: unknown, requiredKey: keyof T): Promise<T> {
    const response = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    const body = (await response.json().catch(() => null)) as
        | (Partial<T> & { error?: string; code?: string; provider?: string })
        | null

    if (!response.ok || !body) {
        const code = (body?.code as AIClientErrorCode) ??
            (response.status === 400 ? 'bad-request' : 'provider-error')

        throw new AIClientError(
            code,
            body?.error ?? `AI request failed (HTTP ${response.status})`,
            body?.provider ?? null
        )
    }

    if (body[requiredKey] === undefined || body[requiredKey] === null) {
        throw new AIClientError('invalid-model-output', 'The AI service returned an incomplete response.')
    }

    return body as T
}

export function sendConversationTurn(payload: ChatPayload): Promise<GatewayChatResponse> {
    return postJson<GatewayChatResponse>('/chat', payload, 'reply')
}

export function summarizeConversation(
    payload: Omit<ChatPayload, 'feedbackMode'>
): Promise<GatewaySummaryResponse> {
    return postJson<GatewaySummaryResponse>('/conversation-summary', payload, 'summary')
}

export function assistWithMessage(payload: {
    kind: 'translate' | 'explain' | 'simplify' | 'correct'
    text: string
    explanationLanguage: 'english' | 'persian' | 'bilingual'
    provider?: 'ollama' | 'cloud'
    model?: string
    allowFallback: boolean
}): Promise<{ reply: string }> {
    return postJson<{ reply: string }>('/assist', payload, 'reply')
}

export async function evaluateWriting(
    payload: EvaluateWritingPayload
): Promise<GatewayEvaluationResponse> {
    const response = await request('/evaluate-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    const body = (await response.json().catch(() => null)) as
        | (Partial<GatewayEvaluationResponse> & { error?: string; code?: string; provider?: string })
        | null

    if (!response.ok || !body) {
        const code = (body?.code as AIClientErrorCode) ??
            (response.status === 400 ? 'bad-request' : 'provider-error')

        throw new AIClientError(
            code,
            body?.error ?? `AI evaluation failed (HTTP ${response.status})`,
            body?.provider ?? null
        )
    }

    if (!body.evaluation || !body.meta) {
        throw new AIClientError('invalid-model-output', 'The AI service returned an incomplete response.')
    }

    return body as GatewayEvaluationResponse
}
