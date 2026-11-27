import type { ItemSummary } from '../types/evidence'
import type { DimensionResult, GapDimension, SkillGapReport } from '../types/skillGap'
import type { SkillName } from '../types/skillProfile'

/**
 * A presentation model over the existing evidence ledger and gap report.
 * This deliberately does not create a new mastery score or store anything.
 */
export interface SkillMeasurement {
    skill: SkillName
    dimensions: GapDimension[]
    observed: number
    independentSuccesses: number
    assistedSuccesses: number | null
    estimate: number | null
    classification: DimensionResult['classification']
    confidence: DimensionResult['confidence']
    distinctDays: number
    lastObservedAt: number | null
}

const SKILL_DIMENSIONS: Record<SkillName, GapDimension[]> = {
    vocabulary: ['vocabRecognition', 'vocabRecall'],
    grammar: ['grammarAccuracy'],
    listening: ['listening'],
    speaking: ['speakingFluency', 'naturalExpression'],
    reading: ['reading'],
    writing: ['writing', 'sentenceConstruction'],
}

function combine(results: DimensionResult[]): Omit<SkillMeasurement, 'skill' | 'dimensions' | 'assistedSuccesses'> {
    const observed = results.reduce((sum, result) => sum + result.observations, 0)
    const independentSuccesses = results.reduce((sum, result) => sum + result.recent.successes + result.earlier.successes, 0)
    const estimate = observed ? Math.round(results.reduce((sum, result) => sum + (result.estimate ?? 0) * result.observations, 0) / observed) : null
    const lastObservedAt = results.reduce<number | null>((latest, result) => Math.max(latest ?? 0, result.lastObservedAt ?? 0) || null, null)
    const distinctDays = Math.max(...results.map(result => result.distinctDays), 0)
    const classification = results.some(result => result.classification === 'weakness')
        ? 'weakness'
        : results.some(result => result.classification === 'developing')
            ? 'developing'
            : results.length > 0 && results.every(result => result.classification === 'strength')
                ? 'strength'
                : 'insufficient'
    const confidence = results.some(result => result.confidence === 'high')
        ? 'high'
        : results.some(result => result.confidence === 'medium')
            ? 'medium'
            : 'low'

    return { observed, independentSuccesses, estimate, classification, confidence, distinctDays, lastObservedAt }
}

/** Build skill-specific measurements from the same inputs used by the planner. */
export function buildSkillMeasurements(gaps: SkillGapReport, summaries: ItemSummary[]): SkillMeasurement[] {
    const dimensions = new Map(gaps.dimensions.map(result => [result.dimension, result]))
    const lexical = summaries.filter(summary => summary.key.startsWith('lex:'))
    const lexicalAssisted = lexical.flatMap(summary => summary.history.filter(entry => entry.ok !== null && (!entry.independent || !entry.verified)))

    return (Object.keys(SKILL_DIMENSIONS) as SkillName[]).map(skill => {
        const skillDimensions = SKILL_DIMENSIONS[skill]
        const base = combine(skillDimensions.map(dimension => dimensions.get(dimension)).filter((result): result is DimensionResult => !!result))

        if (skill !== 'vocabulary') return { skill, dimensions: skillDimensions, ...base, assistedSuccesses: null }

        const vocabResults = skillDimensions.map(dimension => dimensions.get(dimension)).filter((result): result is DimensionResult => !!result)
        const vocabBase = combine(vocabResults)

        return {
            skill,
            dimensions: skillDimensions,
            ...vocabBase,
            assistedSuccesses: lexicalAssisted.filter(entry => entry.ok === true).length,
        }
    })
}
