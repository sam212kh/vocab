import { useJourneyStore } from '../stores/journey'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { useWordProgressStore } from '../stores/wordProgress'

import { backfillLedger } from '../services/evidenceMigration'
import { evidenceFromExercise, evidenceFromJourney, grammarKey, lexKey } from '../services/evidenceBridge'
import type { JourneyExtras, JourneyRecordLike } from '../services/evidenceBridge'

import type { EvidenceMode } from '../types/evidence'
import type { Exercise, ExerciseResult } from '../types/exercise'

/** Thin glue between views and the evidence ledger. Views say WHAT happened; the engine decides what it means. */
export function useEvidenceRecorder() {
    const ledger = useLearningEvidenceStore()

    return {
        /** Journey answers: recognition / recall / production / transfer, with independence taken from the record. */
        recordJourney(record: JourneyRecordLike, extras?: JourneyExtras) {
            ledger.recordMany(evidenceFromJourney(record, extras))
        },

        /** A learner looked at an expression or word. Exposure only — never knowledge. */
        expose(text: string, kind: 'word' | 'expression', ctx?: string) {
            ledger.expose(lexKey(text), kind, ctx)
        },

        /** Vocabulary retrieval completed in a named lesson activity. */
        recordVocabularyRecall(text: string, correct: boolean, ctx: 'practice' | 'meaning-recall') {
            ledger.record({ key: lexKey(text), kind: 'word', mode: 'recall', ok: correct, independent: true, verified: true, ctx, skill: 'vocabulary' })
        },

        /** Grammar topic exercises. Choice items are recognition; typed ones are recall. */
        recordGrammar(topicId: string, exerciseType: string, correct: boolean, independent = true) {
            const choice = ['multiple-choice', 'matching', 'sentence-ordering', 'reading-comprehension', 'listening-comprehension']
            const mode: EvidenceMode = choice.includes(exerciseType) ? 'recognition' : 'recall'

            ledger.record({ key: grammarKey(topicId), kind: 'grammar', mode, ok: correct, independent, ctx: 'grammar', skill: 'grammar' })
        },

        /** Any exercise from the unified engine: its target expressions and objective get evidence. */
        recordExercise(exercise: Exercise, result: ExerciseResult, topicKey: string) {
            ledger.recordMany(evidenceFromExercise(exercise, result, { topicKey }))
        },

        /** Fold pre-ledger data in once, on first run after this feature ships. */
        ensureBackfill() {
            if (ledger.backfilled) return

            ledger.adoptBackfill(backfillLedger({
                journeyEvidence: useJourneyStore().evidence,
                wordProgress: useWordProgressStore().progress,
            }))
        },
    }
}
