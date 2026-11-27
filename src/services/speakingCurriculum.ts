import type { SpeakingTopic } from '../types/speaking'

export type SpeakingBand = 'A1' | 'A2' | 'B1' | 'B2'

const BAND_ORDER: SpeakingBand[] = ['A1', 'A2', 'B1', 'B2']

/** Uses the lowest authored CEFR band when content spans two levels. */
export function speakingBandFor(level: string): SpeakingBand | null {
    const match = level.toUpperCase().match(/A1|A2|B1|B2/)
    return (match?.[0] as SpeakingBand | undefined) ?? null
}

/**
 * Orders the existing speaking library into a learner-facing progression.
 * It never fabricates topics or changes their authored content; ties retain
 * manifest order so content authors still control the sequence within a band.
 */
export function buildSpeakingCurriculum(topics: readonly SpeakingTopic[]): SpeakingTopic[] {
    return topics
        .map((topic, index) => ({ topic, index, band: speakingBandFor(topic.cefrLevel ?? '') }))
        .sort((a, b) => {
            const bandDelta = (a.band ? BAND_ORDER.indexOf(a.band) : BAND_ORDER.length) -
                (b.band ? BAND_ORDER.indexOf(b.band) : BAND_ORDER.length)
            if (bandDelta !== 0) return bandDelta

            const difficultyDelta = (a.topic.difficulty ?? 0) - (b.topic.difficulty ?? 0)
            return difficultyDelta || a.index - b.index
        })
        .map(item => item.topic)
}

export function speakingStepKinds(topic: SpeakingTopic): { repeat: number; open: number } {
    return topic.steps.reduce(
        (counts, step) => {
            counts[step.kind]++
            return counts
        },
        { repeat: 0, open: 0 }
    )
}
