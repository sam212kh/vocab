export type GapDimension =
    | 'vocabRecognition'
    | 'vocabRecall'
    | 'sentenceConstruction'
    | 'grammarAccuracy'
    | 'listening'
    | 'reading'
    | 'writing'
    | 'speakingFluency'
    | 'naturalExpression'
    | 'contextualUsage'

export const GAP_DIMENSIONS: GapDimension[] = [
    'vocabRecognition', 'vocabRecall', 'sentenceConstruction', 'grammarAccuracy', 'listening',
    'reading', 'writing', 'speakingFluency', 'naturalExpression', 'contextualUsage',
]

export type GapClassification = 'strength' | 'developing' | 'weakness' | 'insufficient'
export type GapTrend = 'improving' | 'steady' | 'declining' | 'unknown'
export type GapConfidence = 'low' | 'medium' | 'high'

export interface GapAction {
    label: string
    to: string
}

export interface DimensionResult {
    dimension: GapDimension
    /** Recency-weighted success rate, 0-100; null when there is no evidence at all. */
    estimate: number | null
    classification: GapClassification
    /** Number of independent observations behind the estimate. */
    observations: number
    distinctDays: number
    recent: { observations: number; successes: number }
    earlier: { observations: number; successes: number }
    lastObservedAt: number | null
    confidence: GapConfidence
    trend: GapTrend
    /** Why this classification — always states the evidence it rests on. */
    why: string
    recommendation: GapAction | null
}

export interface GapPattern {
    id: 'recognition-without-recall' | 'correct-but-unnatural' | 'reading-over-listening' | 'choice-without-production' | 'no-transfer'
    title: string
    titlePersian: string
    detail: string
    /** The two dimensions compared and their estimates — the evidence. */
    evidence: { dimension: GapDimension; estimate: number }[]
    action: GapAction
}

export interface SkillGapReport {
    generatedAt: number
    dimensions: DimensionResult[]
    patterns: GapPattern[]
}
