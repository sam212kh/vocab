import { describe, expect, it } from 'vitest'

import { evidenceFromExercise, evidenceFromJourney, exerciseEvidenceMode, exerciseKey, lexKey, normalizeKey, objectiveKey } from './evidenceBridge'
import type { Exercise } from '../types/exercise'
import type { JourneyRecordLike } from './evidenceBridge'

const base: JourneyRecordLike = { stage: 'recall', kind: 'vocab-retrieval', skill: 'vocabulary', itemKey: 'Put the Kettle  on', correct: true, independent: true, hintsUsed: 0, modality: 'typed', timestamp: 1000 }

describe('keys', () => {
    it('normalizes case and whitespace', () => {
        expect(normalizeKey('  Put  the KETTLE on ')).toBe('put the kettle on')
        expect(lexKey('Put the kettle on')).toBe('lex:put the kettle on')
        expect(exerciseKey('x1')).toBe('exercise:x1')
    })
})

describe('Journey → ledger', () => {
    it('unaided typed recall → independent recall evidence on the lexical item', () => {
        const [entry] = evidenceFromJourney(base)

        expect(entry).toMatchObject({ key: 'lex:put the kettle on', mode: 'recall', ok: true, independent: true, verified: true })
    })

    it('a hint makes recall NOT independent (success is recorded, but as assisted)', () => {
        const [entry] = evidenceFromJourney({ ...base, hintsUsed: 1, independent: false })

        expect(entry.independent).toBe(false)
        expect(entry.ok).toBe(true)
    })

    it('recognition is bound to the exercise, not to a word', () => {
        const [entry] = evidenceFromJourney({ ...base, stage: 'recognition', kind: 'recognition-quiz', itemKey: 'mc-1', modality: 'selected' })

        expect(entry).toMatchObject({ key: 'exercise:mc-1', mode: 'recognition', independent: true })
    })

    it('speech / fluency never becomes recall or production evidence', () => {
        expect(evidenceFromJourney({ ...base, stage: 'fluency', modality: 'voice' })).toEqual([])
        expect(evidenceFromJourney({ ...base, stage: 'production', modality: 'voice' })).toEqual([])
    })

    describe('production', () => {
        const production: JourneyRecordLike = { ...base, stage: 'production', kind: 'sentence-construction', itemKey: 'tea-construction', skill: 'writing', evaluator: 'ai', assistance: 'none', outcome: 'correct' }

        it('AI-verified unaided success credits the prompt AND each target expression actually used', () => {
            const inputs = evidenceFromJourney(production, { usedTargets: ['put the kettle on', 'let it steep'] })

            expect(inputs.map(i => i.key)).toEqual(['exercise:tea-construction', 'lex:put the kettle on', 'lex:let it steep'])
            expect(inputs.every(i => i.mode === 'production' && i.independent && i.verified)).toBe(true)
        })

        it('basic (deterministic) checks are UNVERIFIED and cannot progress anything', () => {
            const inputs = evidenceFromJourney({ ...production, evaluator: 'deterministic' }, { usedTargets: ['let it steep'] })

            expect(inputs.every(i => i.verified === false)).toBe(true)
        })

        it.each(['hint', 'after-feedback', 'copied-correction'] as const)('assistance "%s" is not independent', assistance => {
            const inputs = evidenceFromJourney({ ...production, assistance, independent: false }, { usedTargets: ['x'] })

            expect(inputs.every(i => !i.independent)).toBe(true)
        })

        it('a failed sentence credits no target expression', () => {
            const inputs = evidenceFromJourney({ ...production, correct: false, outcome: 'needs-correction' }, { usedTargets: ['let it steep'] })

            expect(inputs).toHaveLength(1)
            expect(inputs[0].ok).toBe(false)
            expect(inputs[0].q).toBe('needs-correction')
        })

        it('a transfer task becomes APPLICATION evidence on the pattern, keyed by its context', () => {
            const inputs = evidenceFromJourney({ ...production, transfer: { patternId: 'polite-request', contextId: 'hotel-room' } })

            expect(inputs).toEqual([expect.objectContaining({ key: 'pattern:polite-request', mode: 'application', ctx: 'hotel-room', independent: true, verified: true })])
        })
    })
})

describe('evidenceFromExercise (unified-engine exercises)', () => {
    const ctx = { topicKey: 'real-life/asking-for-help', at: 5000 }
    const choice: Exercise = { id: 'c', type: 'multiple-choice', skill: 'vocabulary', prompt: 'p', options: ['a', 'b'], correctIndex: 0, targets: ['Could you help me?'], objectiveId: 'ask-help' }
    const typed: Exercise = { id: 't', type: 'fill-blank', skill: 'vocabulary', before: 'Could you', after: 'me?', acceptedAnswers: ['help'], targets: ['Could you help me?'], objectiveId: 'ask-help' }
    const translation: Exercise = { id: 'tr', type: 'translation', skill: 'vocabulary', source: 'x', sourceLang: 'fa', acceptedAnswers: ['y'], targets: ['Could you help me?'], objectiveId: 'ask-help' }

    it('choice = recognition, typed = recall; evidence goes to each target and to the objective', () => {
        expect(evidenceFromExercise(choice, { correct: true }, ctx).map(i => [i.key, i.mode])).toEqual([['lex:could you help me?', 'recognition'], [objectiveKey('real-life/asking-for-help', 'ask-help'), 'recognition']])
        expect(evidenceFromExercise(typed, { correct: true }, ctx).every(i => i.mode === 'recall')).toBe(true)
    })

    it('a hint-assisted answer is never independent', () => {
        expect(evidenceFromExercise(typed, { correct: true, hintUsed: true }, ctx).every(i => i.independent === false)).toBe(true)
        expect(evidenceFromExercise(typed, { correct: true }, ctx).every(i => i.independent === true)).toBe(true)
    })

    it('a miss on an open-ended translation is unverified; a miss on a closed fill-blank counts', () => {
        expect(evidenceFromExercise(translation, { correct: false }, ctx).every(i => i.verified === false)).toBe(true)
        expect(evidenceFromExercise(translation, { correct: true }, ctx).every(i => i.verified === true)).toBe(true)
        expect(evidenceFromExercise(typed, { correct: false }, ctx).every(i => i.verified === true)).toBe(true)
    })

    it('records nothing for exercises without targets or objective, and for writing responses', () => {
        expect(evidenceFromExercise({ ...typed, targets: undefined, objectiveId: undefined }, { correct: true }, ctx)).toEqual([])
        expect(evidenceFromExercise({ id: 'w', type: 'writing-response', skill: 'writing', prompt: 'p', targets: ['x'] }, { correct: true }, ctx)).toEqual([])
        expect(exerciseEvidenceMode('writing-response')).toBeNull()
    })
})
