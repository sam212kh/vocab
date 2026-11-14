import { AIClientError } from './aiClient'

import type {
    AssessmentAnswer,
    AssessmentProgress,
    AssessmentResultResponse,
    SanitizedAssessmentItem,
    StartAssessmentRequest,
    StartAssessmentResponse,
    SubmitAnswerResponse,
} from '../types/assessment'

/**
 * Typed client for the server-side assessment module. The server is
 * authoritative: it selects items, keeps the answer keys, scores answers
 * and computes results — this client only transports sanitized data.
 */

const BASE_URL = '/api/assessment'

const TIMEOUT_MS = 15000

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response

    try {
        response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal })
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new AIClientError('timeout', 'The assessment service timed out.')
        }

        throw new AIClientError('gateway-unreachable', 'The assessment service is not reachable.')
    } finally {
        clearTimeout(timer)
    }

    const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null

    if (!response.ok || body === null) {
        throw new AIClientError(
            'bad-request',
            body?.error ?? `Assessment request failed (HTTP ${response.status})`
        )
    }

    return body
}

export function startAssessment(payload: StartAssessmentRequest): Promise<StartAssessmentResponse> {
    return call<StartAssessmentResponse>('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
}

export function fetchNextItem(sessionId: string): Promise<{ item: SanitizedAssessmentItem | null; progress: AssessmentProgress }> {
    return call(`/session/${sessionId}/next`)
}

export function submitAnswer(
    sessionId: string,
    itemId: string,
    answer: AssessmentAnswer,
    timeSpentMs?: number
): Promise<SubmitAnswerResponse> {
    return call<SubmitAnswerResponse>(`/session/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, answer, timeSpentMs }),
    })
}

export function pauseAssessment(sessionId: string): Promise<{ status: string; progress: AssessmentProgress }> {
    return call(`/session/${sessionId}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
}

export function resumeAssessment(
    sessionId: string
): Promise<{ status: string; item: SanitizedAssessmentItem | null; progress: AssessmentProgress }> {
    return call(`/session/${sessionId}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
}

export function completeAssessment(sessionId: string): Promise<{ status: string; progress: AssessmentProgress }> {
    return call(`/session/${sessionId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
}

export function fetchAssessmentResult(sessionId: string): Promise<AssessmentResultResponse> {
    return call(`/session/${sessionId}/result`)
}
