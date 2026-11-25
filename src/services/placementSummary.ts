import type { AssessmentLevelEvidence, SkillEstimateResult } from '../types/assessment'

/**
 * Turns a raw SkillEstimateResult into short, human-readable strengths/
 * weaknesses strings for SkillProfile.setStrengthsAndWeaknesses — kept
 * separate from the assessment engine itself (which stays purely
 * numeric/evidence-based) so this wording can change without touching
 * anything the engine's own tests depend on.
 */
export function describeEstimate(result: SkillEstimateResult): { strengths: string[]; weaknesses: string[] } {
    const held = result.evidence.filter(row => row.verdict === 'held')
    const failedOrBorderline = result.evidence.filter(row => row.verdict === 'failed' || row.verdict === 'borderline')

    const strengths = held
        .sort((a, b) => levelRank(b.level) - levelRank(a.level))
        .slice(0, 2)
        .map(row => `Solid at ${row.level} (${describeAccuracy(row)})`)

    const weaknesses = failedOrBorderline
        .sort((a, b) => levelRank(a.level) - levelRank(b.level))
        .slice(0, 2)
        .map(row => `${row.verdict === 'failed' ? 'Struggled at' : 'Inconsistent at'} ${row.level} (${describeAccuracy(row)})`)

    if (!strengths.length && result.level) strengths.push(`Reached ${result.level} with the current item set`)
    if (!weaknesses.length && result.evidenceQuality !== 'good') weaknesses.push('Not enough answers yet for a confident read above this level')

    return { strengths, weaknesses }
}

function describeAccuracy(row: AssessmentLevelEvidence): string {
    return `${row.correct}/${row.asked} correct`
}

const ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function levelRank(level: string): number {
    return ORDER.indexOf(level)
}

/** Skills this app can currently placement-test — see docs/PHASE11_PLACEMENT_ASSESSMENT.md §2. */
export const PLACEMENT_SKILLS = ['vocabulary', 'grammar'] as const

export const NOT_YET_ASSESSED_SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const
