import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAssessmentsStore } from './assessments'

import type { SkillEstimateResult } from '../types/assessment'

beforeEach(() => {
    setActivePinia(createPinia())
})

const RESULT: SkillEstimateResult = {
    skill: 'grammar',
    level: 'B1',
    confidence: 0.6,
    evidenceQuality: 'moderate',
    evidence: [],
    notes: ['Internal estimate from a self-administered assessment — not a certified CEFR examination.'],
}

describe('assessments store', () => {
    it('tracks a started session and records answer summaries without duplicates', () => {
        const store = useAssessmentsStore()
        const session = store.trackStarted('srv-1', 'grammar', 'skill-check')

        store.recordAnswer(session.id, { itemId: 'i1', level: 'B1', itemType: 'multiple-choice', correct: true, timeSpentMs: 1200 })
        store.recordAnswer(session.id, { itemId: 'i1', level: 'B1', itemType: 'multiple-choice', correct: false, timeSpentMs: 99 })

        expect(store.sessions[0].administered).toHaveLength(1)
        expect(store.sessions[0].administered[0].correct).toBe(true)
    })

    it('completing records the result; previous results are never overwritten', () => {
        const store = useAssessmentsStore()

        const first = store.trackStarted('srv-1', 'grammar', 'skill-check')
        store.recordResult(first.id, RESULT)

        const second = store.trackStarted('srv-2', 'grammar', 'skill-check')
        store.recordResult(second.id, { ...RESULT, level: 'B2' })

        expect(store.sessions.find(s => s.id === 'srv-1')!.result!.level).toBe('B1')
        expect(store.latestEstimate('grammar')!.level).toBe('B2')
    })

    it('latestEstimate is per-skill and null without completed sessions', () => {
        const store = useAssessmentsStore()

        store.trackStarted('srv-1', 'reading', 'skill-check')

        expect(store.latestEstimate('reading')).toBeNull()
        expect(store.latestEstimate('listening')).toBeNull()
    })

    it('resumableSession finds active or paused sessions', () => {
        const store = useAssessmentsStore()
        const session = store.trackStarted('srv-1', 'grammar', 'placement')

        expect(store.resumableSession?.id).toBe(session.id)

        store.setStatus(session.id, 'paused')
        expect(store.resumableSession?.id).toBe(session.id)

        store.recordResult(session.id, RESULT)
        expect(store.resumableSession).toBeNull()
    })

    it('persists across store instances', () => {
        const first = useAssessmentsStore()
        const session = first.trackStarted('srv-1', 'grammar', 'skill-check')
        first.recordResult(session.id, RESULT)

        setActivePinia(createPinia())
        const second = useAssessmentsStore()

        expect(second.sessions).toHaveLength(1)
        expect(second.latestEstimate('grammar')!.level).toBe('B1')
    })

    it('migration drops malformed entries safely', () => {
        localStorage.setItem(
            'english-upgrade-assessments',
            JSON.stringify({ __version: 1, data: [{ broken: true }, { id: 'ok', skill: 'grammar', administered: [] }] })
        )

        const store = useAssessmentsStore()

        expect(store.sessions).toHaveLength(1)
        expect(store.sessions[0].id).toBe('ok')
    })

    it('never persists anything answer-key-shaped', () => {
        const store = useAssessmentsStore()
        const session = store.trackStarted('srv-1', 'grammar', 'skill-check')
        store.recordAnswer(session.id, { itemId: 'i1', level: 'B1', itemType: 'fill-blank', correct: true, timeSpentMs: null })
        store.recordResult(session.id, RESULT)

        const raw = localStorage.getItem('english-upgrade-assessments')!

        expect(raw).not.toMatch(/acceptedAnswers|correctIndex|canonical/)
    })

    it('does not touch SRS storage keys', () => {
        const srsBefore = localStorage.getItem('english-upgrade-word-progress')

        const store = useAssessmentsStore()
        const session = store.trackStarted('srv-1', 'vocabulary', 'placement')
        store.recordResult(session.id, { ...RESULT, skill: 'vocabulary' })

        expect(localStorage.getItem('english-upgrade-word-progress')).toBe(srsBefore)
    })
})
