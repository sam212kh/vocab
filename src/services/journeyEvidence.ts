import { LEARNING_STAGES } from '../types/journey'

import type {
    JourneyEvidenceRecord,
    JourneySummary,
    LearningStage,
} from '../types/journey'
import type { RecordPerformanceInput } from '../stores/performance'

/**
 * Learning-stage evidence rules. PURE.
 *
 * A multiple-choice hit is RECOGNITION evidence only. Typed retrieval with
 * no options shown is RECALL. A learner-authored sentence is PRODUCTION.
 * Spoken, understandable output is FLUENCY — and only modality 'voice'
 * may ever evidence Speaking. Response speed is never used.
 */

export function emptyStageCounts(): Record<LearningStage, number> {
    return { recognition: 0, recall: 0, production: 0, fluency: 0 }
}

/** Count CORRECT evidence per stage (planner uses it to balance sessions). */
export function stageCountsFrom(records: JourneyEvidenceRecord[]): Record<LearningStage, number> {
    const counts = emptyStageCounts()

    for (const record of records) {
        if (record.correct) counts[record.stage]++
    }

    return counts
}

/**
 * Classify a typed-retrieval answer. Hints (e.g. revealing the first
 * letter) demote an independent recall to a non-independent one — it still
 * counts as recall evidence but is NOT "recalled independently".
 */
export function retrievalEvidence(
    base: Pick<JourneyEvidenceRecord, 'sessionId' | 'activityId' | 'kind' | 'skill' | 'itemKey' | 'timestamp'>,
    correct: boolean,
    hintsUsed: number
): Omit<JourneyEvidenceRecord, 'id'> {
    return {
        ...base,
        stage: 'recall',
        correct,
        independent: hintsUsed === 0,
        hintsUsed,
        modality: 'typed',
        completeness: null,
    }
}

/** Selected-from-options answers: recognition, never independent. */
export function recognitionEvidence(
    base: Pick<JourneyEvidenceRecord, 'sessionId' | 'activityId' | 'kind' | 'skill' | 'itemKey' | 'timestamp'>,
    correct: boolean
): Omit<JourneyEvidenceRecord, 'id'> {
    return {
        ...base,
        stage: 'recognition',
        correct,
        independent: false,
        hintsUsed: 0,
        modality: 'selected',
        completeness: null,
    }
}

/**
 * A learner-authored sentence. "correct" here means: it is substantive
 * (long enough) AND uses at least one target expression — deterministic and
 * honest; it does NOT claim grammatical correctness (that needs AI/teacher).
 */
export function productionEvidence(
    base: Pick<JourneyEvidenceRecord, 'sessionId' | 'activityId' | 'kind' | 'skill' | 'itemKey' | 'timestamp'>,
    text: string,
    targetExpressions: string[]
): Omit<JourneyEvidenceRecord, 'id'> & { usedTargets: string[] } {
    const words = text.trim().split(/\s+/).filter(Boolean).length
    const normalized = text.toLowerCase()

    const usedTargets = targetExpressions.filter(target => normalized.includes(target.toLowerCase()))

    const completeness = Math.min(1, words / 8)

    return {
        ...base,
        stage: 'production',
        correct: words >= 4 && usedTargets.length > 0,
        independent: true,
        hintsUsed: 0,
        modality: 'typed',
        completeness: Number(completeness.toFixed(2)),
        usedTargets,
    }
}

/** Spoken attempt: voice modality is the ONLY way to evidence Speaking. */
export function speakingEvidence(
    base: Pick<JourneyEvidenceRecord, 'sessionId' | 'activityId' | 'kind' | 'itemKey' | 'timestamp'>,
    transcriptMatchScore: number
): Omit<JourneyEvidenceRecord, 'id'> {
    return {
        ...base,
        skill: 'speaking',
        stage: 'fluency',
        correct: transcriptMatchScore >= 60,
        independent: true,
        hintsUsed: 0,
        modality: 'voice',
        completeness: Number(Math.min(1, transcriptMatchScore / 100).toFixed(2)),
    }
}

/**
 * Which existing PerformanceEvents an evidence record justifies — keeps the
 * established skill summaries / recommendations / mistake-driven planning
 * working without changing PerformanceEvent's shape.
 *
 * Speaking events ONLY for voice modality. Typed production counts toward
 * the record's own skill (writing), never speaking.
 */
export function performanceEventFor(
    record: Omit<JourneyEvidenceRecord, 'id'>
): RecordPerformanceInput {
    const skill = record.modality === 'voice' ? 'speaking' : record.skill === 'speaking' ? 'vocabulary' : record.skill

    return {
        skill,
        activityId: `journey-${record.kind}`,
        lessonId: record.itemKey,
        result: record.correct ? 'correct' : 'incorrect',
        errorCategories: record.correct ? [] : [skill === 'grammar' ? 'grammar' : 'vocabulary'],
        confidence: null,
    }
}

/**
 * Effort-weighted score. Deliberately NOT accuracy-weighted toward easy
 * wins: independent retrieval and production count most; recognition hits
 * count least; hint-assisted answers count less; incorrect ATTEMPTS still
 * earn effort credit (practice effort, not just right answers).
 */
export function effortScore(records: JourneyEvidenceRecord[]): number {
    const weight: Record<LearningStage, number> = { recognition: 1, recall: 3, production: 4, fluency: 4 }

    let score = 0

    for (const record of records) {
        let points = weight[record.stage]

        if (!record.correct) points = Math.ceil(points / 3)
        if (record.hintsUsed > 0) points = Math.max(1, points - record.hintsUsed)

        score += points
    }

    return score
}

export function summarizeSession(
    records: JourneyEvidenceRecord[],
    activitiesCompleted: number,
    activitiesTotal: number,
    wrongItemKeys: string[]
): JourneySummary {
    const stageBreakdown = Object.fromEntries(
        LEARNING_STAGES.map(stage => [stage, { attempts: 0, correct: 0 }])
    ) as JourneySummary['stageBreakdown']

    for (const record of records) {
        stageBreakdown[record.stage].attempts++
        if (record.correct) stageBreakdown[record.stage].correct++
    }

    const encountered = new Set(records.map(record => record.itemKey))
    const independent = new Set(
        records.filter(record => record.stage === 'recall' && record.correct && record.independent).map(record => record.itemKey)
    )

    const skills = [...new Set(records.map(record => record.skill))]

    const production = records.filter(record => record.stage === 'production').length

    let nextSuggestion = 'Come back tomorrow for a fresh journey.'

    if (stageBreakdown.recall.attempts && stageBreakdown.recall.correct / stageBreakdown.recall.attempts < 0.5) {
        nextSuggestion = 'Recall was tough today — repeat the same phrases in tomorrow\'s review; retrieval gets easier with spacing.'
    } else if (!production) {
        nextSuggestion = 'Try a Standard journey next time — it adds a sentence-building step so you practice producing English, not just recognizing it.'
    } else if (!stageBreakdown.fluency.attempts) {
        nextSuggestion = 'Add speaking next time: say your sentences aloud (or try the Extended roleplay).'
    }

    return {
        activitiesCompleted,
        activitiesTotal,
        expressionsEncountered: encountered.size,
        expressionsRecalledIndependently: independent.size,
        productiveAttempts: production,
        skillsPracticed: skills,
        stageBreakdown,
        mistakesWorthReviewing: [...new Set(wrongItemKeys)].slice(0, 6),
        effortScore: effortScore(records),
        nextSuggestion,
    }
}
