import type { EvidenceInput, EvidenceMode } from '../types/evidence'
import type { Exercise, ExerciseResult } from '../types/exercise'
import type { SkillName } from '../types/skillProfile'

/**
 * Maps existing Journey evidence onto ledger inputs. PURE.
 *
 * Journey records say how an answer came about (independent / hinted /
 * AI-assisted / basic-check). The ledger needs the same facts in its own
 * vocabulary: independent (unaided) and verified (judged by more than a
 * length/keyword check).
 */

export function normalizeKey(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export const lexKey = (text: string) => `lex:${normalizeKey(text)}`
export const exerciseKey = (id: string) => `exercise:${id}`
export const grammarKey = (topicId: string) => `grammar:${topicId}`
export const patternKey = (patternId: string) => `pattern:${patternId}`
/** Objective-level evidence. `topicKey` is module-qualified, e.g. `grammar/present-simple`. */
export const objectiveKey = (topicKey: string, objectiveId: string) => `objective:${topicKey}#${objectiveId}`

export interface JourneyRecordLike {
    stage: 'recognition' | 'recall' | 'production' | 'fluency'
    kind: string
    skill: SkillName
    itemKey: string
    correct: boolean
    independent: boolean
    hintsUsed: number
    modality: 'typed' | 'voice' | 'selected'
    timestamp: number
    evaluator?: 'ai' | 'deterministic'
    assistance?: 'none' | 'hint' | 'after-feedback' | 'copied-correction'
    outcome?: string
    issues?: string[]
    transfer?: { patternId: string; contextId: string }
}

export interface JourneyExtras {
    /** Target expressions the sentence actually used (verified by the evaluator / matcher). */
    usedTargets?: string[]
    lexKind?: 'word' | 'expression'
}

export function evidenceFromJourney(record: JourneyRecordLike, extras: JourneyExtras = {}): EvidenceInput[] {
    /* Reading model sentences aloud (fluency / voice) is neither recall nor production. */
    if (record.stage === 'fluency' || record.modality === 'voice') return []

    const unaided = record.hintsUsed === 0 && (record.assistance ?? 'none') === 'none'
    const at = record.timestamp

    if (record.stage === 'recognition') {
        return [{ key: exerciseKey(record.itemKey), kind: 'exercise', mode: 'recognition', ok: record.correct, independent: unaided, verified: true, skill: record.skill, at }]
    }

    if (record.stage === 'recall') {
        return [{
            key: record.kind === 'vocab-retrieval' ? lexKey(record.itemKey) : exerciseKey(record.itemKey),
            kind: record.kind === 'vocab-retrieval' ? extras.lexKind ?? 'word' : 'exercise',
            mode: 'recall', ok: record.correct, independent: unaided, verified: true, ctx: record.kind, skill: record.skill, at,
        }]
    }

    /* production */
    const verified = record.evaluator === 'ai'
    const independent = record.independent && unaided
    const inputs: EvidenceInput[] = []

    if (record.transfer) {
        inputs.push({
            key: patternKey(record.transfer.patternId), kind: 'pattern', mode: 'application', ok: record.correct,
            independent, verified, ctx: record.transfer.contextId, skill: record.skill, q: record.outcome, at,
        })

        return inputs
    }

    /* The prompt itself (for skill analysis)… */
    inputs.push({ key: exerciseKey(record.itemKey), kind: 'exercise', mode: 'production', ok: record.correct, independent, verified, ctx: record.itemKey, skill: record.skill, q: record.outcome, at })

    /* …and every target expression the learner genuinely used in their own sentence. */
    if (record.correct) {
        for (const target of extras.usedTargets ?? []) {
            inputs.push({ key: lexKey(target), kind: 'expression', mode: 'production', ok: true, independent, verified, ctx: record.itemKey, skill: record.skill, at })
        }
    }

    return inputs
}

/* ---------- unified-engine exercises (Grammar, Reading, Listening, Real-Life) ---------- */

const CHOICE_TYPES = new Set(['multiple-choice', 'listening-comprehension', 'reading-comprehension', 'matching', 'sentence-ordering'])
/** Open-ended typed answers: a miss can be a valid wording we did not list, so it is not held against the learner. */
const OPEN_TYPED = new Set(['translation', 'short-answer'])

export function exerciseEvidenceMode(type: Exercise['type']): EvidenceMode | null {
    if (type === 'writing-response') return null

    return CHOICE_TYPES.has(type) ? 'recognition' : 'recall'
}

export interface ExerciseEvidenceContext {
    /** Module-qualified topic, e.g. `real-life/making-tea`. Needed for objective evidence. */
    topicKey: string
    at?: number
}

/**
 * Turns one answered exercise into ledger inputs. PURE.
 *
 *  - choice items are recognition, typed items are recall (the learner produced the words from a cue),
 *  - a hint-assisted answer is never independent,
 *  - a deterministic MISS on an open-ended typed item is recorded unverified (never counts against),
 *  - writing-response is judged elsewhere (length / evaluator) and records nothing here.
 *  - evidence goes to each target expression and, when the exercise names one, to its objective.
 */
export function evidenceFromExercise(exercise: Exercise, result: Pick<ExerciseResult, 'correct' | 'hintUsed'>, context: ExerciseEvidenceContext): EvidenceInput[] {
    const mode = exerciseEvidenceMode(exercise.type)

    if (!mode) return []

    const independent = result.hintUsed !== true
    const verified = result.correct || !OPEN_TYPED.has(exercise.type)
    const base = { mode, ok: result.correct, independent, verified, skill: exercise.skill, ctx: context.topicKey, at: context.at }
    const inputs: EvidenceInput[] = []

    for (const target of exercise.targets ?? []) inputs.push({ ...base, key: lexKey(target), kind: 'expression' })

    if (exercise.objectiveId) inputs.push({ ...base, key: objectiveKey(context.topicKey, exercise.objectiveId), kind: 'objective' })

    return inputs
}
