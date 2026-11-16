import { LEARNING_STAGES } from '../types/journey'
import { FIRST_ATTEMPT, classifyAssistance } from './productionAssistance'
import type { ProductionAttemptContext } from './productionAssistance'
import type { SentenceEvaluation } from '../types/sentenceEvaluation'

import type {
    JourneyEvidenceRecord,
    JourneySummary,
    LearningStage,
} from '../types/journey'
import type { RecordPerformanceInput } from '../stores/performance'
import type { ErrorCategory } from '../types/performance'

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
        if (!record.correct) continue

        /* Production counts only when it was independent: a retry after
         * feedback or a copied correction is practice, not unaided production. */
        if (record.stage === 'production' && !record.independent) continue

        counts[record.stage]++
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
    targetExpressions: string[],
    context: ProductionAttemptContext = FIRST_ATTEMPT
): Omit<JourneyEvidenceRecord, 'id'> & { usedTargets: string[] } {
    const words = text.trim().split(/\s+/).filter(Boolean).length
    const normalized = text.toLowerCase()

    const usedTargets = targetExpressions.filter(target => normalized.includes(target.toLowerCase()))

    const completeness = Math.min(1, words / 8)

    const assistance = classifyAssistance(text, context)

    return {
        ...base,
        stage: 'production',
        correct: assistance !== 'copied-correction' && words >= 4 && usedTargets.length > 0,
        independent: assistance === 'none',
        hintsUsed: context.hintUsed ? 1 : 0,
        modality: 'typed',
        completeness: Number(completeness.toFixed(2)),
        evaluator: 'deterministic',
        assistance,
        attempt: context.attempt,
        usedTargets,
    }
}

/**
 * Production evidence from a validated AI sentence evaluation. `correct`
 * is the evaluation's own verdict (complete, relevant, meaning-preserving,
 * language-correct) — never a score and never a level. Whether the answer
 * counts as INDEPENDENT production depends only on how it came about.
 */
export function evaluatedProductionEvidence(
    base: Pick<JourneyEvidenceRecord, 'sessionId' | 'activityId' | 'kind' | 'skill' | 'itemKey' | 'timestamp'>,
    evaluation: SentenceEvaluation,
    context: ProductionAttemptContext = FIRST_ATTEMPT
): Omit<JourneyEvidenceRecord, 'id'> {
    const assistance = classifyAssistance(evaluation.learnerSentence, context)
    const words = evaluation.learnerSentence.trim().split(/\s+/).filter(Boolean).length

    return {
        ...base,
        stage: 'production',
        correct: evaluation.passed && assistance !== 'copied-correction',
        independent: assistance === 'none',
        hintsUsed: context.hintUsed ? 1 : 0,
        /* Typed. Never a speaking source. */
        modality: 'typed',
        completeness: Number(Math.min(1, words / 8).toFixed(2)),
        evaluator: 'ai',
        assistance,
        attempt: context.attempt,
        outcome: evaluation.outcome,
        issues: evaluation.issues,
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
        errorCategories: record.correct ? [] : errorCategoriesFor(record, skill),
        confidence: null,
    }
}

function errorCategoriesFor(
    record: Omit<JourneyEvidenceRecord, 'id'>,
    skill: string
): ErrorCategory[] {
    const mapped = new Set<ErrorCategory>()

    for (const issue of record.issues ?? []) {
        if (issue === 'grammar') mapped.add('grammar')
        else if (issue === 'word-order') mapped.add('word-order')
        else if (issue === 'vocabulary' || issue === 'unnatural') mapped.add('vocabulary')
        else if (issue === 'meaning' || issue === 'off-topic' || issue === 'incomplete') mapped.add('task-constraints')
    }

    return mapped.size ? [...mapped] : [skill === 'grammar' ? 'grammar' : 'vocabulary']
}

/**
 * Only a learner's FIRST attempt feeds the shared skill statistics. A retry
 * after feedback (or a copied correction) is practice — counting it as
 * another "correct" writing event would inflate accuracy.
 */
export function countsForPerformance(record: Omit<JourneyEvidenceRecord, 'id'>): boolean {
    return (record.attempt ?? 1) <= 1 && record.assistance !== 'copied-correction'
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
        /* Retyping a correction you were shown is minimal practice effort. */
        if (record.assistance === 'copied-correction') points = 1

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

    const productionRecords = records.filter(record => record.stage === 'production')
    const production = productionRecords.filter(record => record.assistance !== 'copied-correction').length

    const productionBreakdown: JourneySummary['production'] = {
        independent: productionRecords.filter(record => record.correct && record.independent).length,
        hintAssisted: productionRecords.filter(record => record.assistance === 'hint').length,
        afterFeedback: productionRecords.filter(record => record.assistance === 'after-feedback').length,
        copiedCorrection: productionRecords.filter(record => record.assistance === 'copied-correction').length,
        aiEvaluated: productionRecords.filter(record => record.evaluator === 'ai').length,
        basicCheckOnly: productionRecords.filter(record => record.evaluator !== 'ai').length,
    }

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
        production: productionBreakdown,
        skillsPracticed: skills,
        stageBreakdown,
        mistakesWorthReviewing: [...new Set(wrongItemKeys)].slice(0, 6),
        effortScore: effortScore(records),
        nextSuggestion,
    }
}
