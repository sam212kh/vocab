import { checkPronunciation, SPEAKING_PASS_SCORE } from './pronunciation'

export interface RealLifeSpeakingOutcome {
    score: number
    closest: string
    /** Speaking evidence to record; null when there is no real voice transcript. */
    event: {
        skill: 'speaking'
        activityId: string
        lessonId: string
        result: 'correct' | 'incorrect'
        confidence: number | null
    } | null
}

/**
 * Scores a VOICE transcript against the best-matching model sentence using the
 * existing transcript matcher and the shared pass threshold. This is transcript
 * similarity, not pronunciation scoring. An empty transcript yields no evidence.
 */
export function evaluateRealLifeSpeaking(
    scenarioId: string,
    modelSentences: string[],
    transcript: string,
    recognizerConfidence: number | null
): RealLifeSpeakingOutcome {
    const spoken = transcript.trim()

    if (!spoken) {
        return { score: 0, closest: modelSentences[0] ?? '', event: null }
    }

    let best = { score: -1, sentence: modelSentences[0] ?? '' }

    for (const sentence of modelSentences) {
        const { score } = checkPronunciation(sentence, spoken)
        if (score > best.score) best = { score, sentence }
    }

    const score = Math.max(0, best.score)

    return {
        score,
        closest: best.sentence,
        event: {
            skill: 'speaking',
            activityId: `real-life-${scenarioId}`,
            lessonId: scenarioId,
            result: score >= SPEAKING_PASS_SCORE ? 'correct' : 'incorrect',
            confidence: recognizerConfidence || null,
        },
    }
}
