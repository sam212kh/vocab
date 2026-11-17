import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLearningEvidenceStore } from './learningEvidence'
import { useWordProgressStore } from './wordProgress'

beforeEach(() => setActivePinia(createPinia()))

describe('SRS ↔ evidence ledger', () => {
    it('writes an attempt to the ledger only when the caller describes it', () => {
        const srs = useWordProgressStore()
        const ledger = useLearningEvidenceStore()

        srs.recordCorrect('achieve', 'upgrade', 'b1')
        expect(Object.keys(ledger.items)).toEqual([])

        srs.recordCorrect('achieve', 'upgrade', 'b1', { mode: 'recall', ctx: 'practice' })
        srs.recordWrong('adapt', 'upgrade', 'b1', { mode: 'recognition', ctx: 'quiz' })

        expect(ledger.items['lex:achieve'].counts.recall.independentSuccess).toBe(1)
        expect(ledger.items['lex:adapt'].counts.recognition.failures).toBe(1)
    })

    it('real-life items are tagged as expressions, vocabulary as words', () => {
        const srs = useWordProgressStore()
        const ledger = useLearningEvidenceStore()

        srs.recordCorrect('let it steep', 'real-life', 'making-tea', { mode: 'recall' })
        srs.recordCorrect('achieve', 'upgrade', 'b1', { mode: 'recall' })

        expect(ledger.items['lex:let it steep'].kind).toBe('expression')
        expect(ledger.items['lex:achieve'].kind).toBe('word')
    })

    it('a hint-assisted attempt can be recorded as NOT independent', () => {
        const srs = useWordProgressStore()
        const ledger = useLearningEvidenceStore()

        srs.recordCorrect('achieve', 'upgrade', 'b1', { mode: 'recall', independent: false })

        expect(ledger.summaryFor('lex:achieve')?.independentSuccesses).toBe(0)
        expect(ledger.summaryFor('lex:achieve')?.assistedSuccesses).toBe(1)
    })

    it('SM-2 scheduling is identical with and without evidence (the ledger never changes the scheduler)', () => {
        const withEvidence = useWordProgressStore()

        withEvidence.recordCorrect('same', 'c', 'l', { mode: 'recall' })
        const a = { ...withEvidence.getProgress('same', 'c', 'l') }

        setActivePinia(createPinia())
        localStorage.clear()

        const without = useWordProgressStore()

        without.recordCorrect('same', 'c', 'l')
        const b = { ...without.getProgress('same', 'c', 'l') }

        for (const key of ['status', 'level', 'streak', 'easeFactor', 'intervalDays', 'correctAnswers'] as const) expect(a[key]).toBe(b[key])
    })

    it('the SRS "mastered" status is NOT mastery evidence: five hinted-free-less correct answers without ledger evidence leave the stage empty', () => {
        const srs = useWordProgressStore()
        const ledger = useLearningEvidenceStore()

        for (let i = 0; i < 6; i++) srs.recordCorrect('legacyword', 'c', 'l')

        expect(srs.getProgress('legacyword', 'c', 'l').status).toBe('mastered')
        expect(ledger.summaryFor('lex:legacyword')).toBeNull()
    })
})
