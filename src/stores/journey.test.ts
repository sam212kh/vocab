import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useJourneyStore } from './journey'
import { useWordProgressStore } from './wordProgress'
import { planJourney } from '../services/journeyPlanner'
import { calculateNextReview } from '../services/spacedRepetition'
import { productionEvidence, retrievalEvidence } from '../services/journeyEvidence'

import type { JourneyPlan, PlannerInput, ThemeCandidate } from '../types/journey'

beforeEach(() => {
    setActivePinia(createPinia())
})

function theme(id: string): ThemeCandidate {
    return {
        id, title: id, titlePersian: 'موضوع',
        expressions: [{ english: 'put the kettle on', persian: 'x', example: 'e' }],
        exercises: [{ id: `${id}-mc`, type: 'multiple-choice', skill: 'vocabulary', prompt: 'q', options: ['a', 'b'], correctIndex: 0 }],
        speakingSentences: ['I put the kettle on.'],
        constructionPrompt: { id: `${id}-c`, promptPersian: 'p', promptEnglish: 'Describe', targetExpressions: ['kettle'], modelSentences: ['m'] },
    }
}

function plan(themes: ThemeCandidate[] = [theme('making-tea')]): JourneyPlan {
    const input: PlannerInput = {
        length: 'standard', dueWords: [], newWords: [], dueGrammarTopics: [], grammarExercises: [],
        themes, dictationExercises: [], careerQuestions: [], recurringMistakeCategories: [],
        weakSkills: [], recentlyCompleted: [], speakingEnabled: true,
        stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
    }

    return planJourney(input)
}

describe('journey store', () => {
    it('starts a session with every activity pending, and exposes it as active', () => {
        const store = useJourneyStore()
        const session = store.startSession(plan())

        expect(store.activeSession?.id).toBe(session.id)
        expect(Object.values(session.statuses).every(status => status === 'pending')).toBe(true)
    })

    it('advances through activities and completes the session after the last one', () => {
        const store = useJourneyStore()
        const session = store.startSession(plan())
        const ids = session.plan.activities.map(a => a.id)

        store.completeActivity(session.id, ids[0])
        expect(store.activeSession!.currentIndex).toBe(1)

        for (const id of ids.slice(1)) store.completeActivity(session.id, id)

        expect(store.activeSession).toBeNull()
        expect(store.completedSessions).toHaveLength(1)
        expect(store.completedJourneyCount).toBe(1)
    })

    it('skipped activities do not count as completed practice', () => {
        const store = useJourneyStore()
        const session = store.startSession(plan())

        for (const activity of session.plan.activities) {
            store.completeActivity(session.id, activity.id, 'skipped')
        }

        expect(store.completedJourneyCount).toBe(0)
        expect(store.recentlyCompletedSourceIds()).toEqual([])
    })

    it('interrupted session persists and resumes at the same position', () => {
        const first = useJourneyStore()
        const session = first.startSession(plan())
        first.completeActivity(session.id, session.plan.activities[0].id)

        setActivePinia(createPinia())
        const second = useJourneyStore()

        expect(second.activeSession?.id).toBe(session.id)
        expect(second.activeSession?.currentIndex).toBe(1)
        expect(second.activeSession?.statuses[session.plan.activities[0].id]).toBe('completed')
    })

    it('no-repeat memory: completed activities feed the next plan, so a theme is not repeated', () => {
        const store = useJourneyStore()
        const first = store.startSession(plan([theme('making-tea'), theme('ordering-food')]))

        expect(first.plan.theme?.id).toBe('making-tea')

        for (const activity of first.plan.activities) store.completeActivity(first.id, activity.id)

        const recent = store.recentlyCompletedSourceIds()
        expect(recent).toContain('making-tea')

        const next = planJourney({
            length: 'standard', dueWords: [], newWords: [], dueGrammarTopics: [], grammarExercises: [],
            themes: [theme('making-tea'), theme('ordering-food')], dictationExercises: [], careerQuestions: [],
            recurringMistakeCategories: [], weakSkills: [], recentlyCompleted: recent, speakingEnabled: true,
            stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
        })

        expect(next.theme?.id).toBe('ordering-food')
    })

    it('starting a new journey replaces an unfinished one (one active at a time)', () => {
        const store = useJourneyStore()
        const a = store.startSession(plan())
        const b = store.startSession(plan())

        expect(store.activeSession?.id).toBe(b.id)
        expect(store.sessions.find(s => s.id === a.id)!.completedAt).not.toBeNull()
    })

    it('records evidence per session with stage/independence preserved', () => {
        const store = useJourneyStore()
        const session = store.startSession(plan())
        const activity = session.plan.activities[0]

        const base = { sessionId: session.id, activityId: activity.id, kind: activity.kind, skill: activity.skill, itemKey: 'kettle', timestamp: 1 }

        store.addEvidence(session.id, retrievalEvidence(base, true, 0))
        store.addEvidence(session.id, retrievalEvidence(base, true, 1))
        store.addEvidence(session.id, productionEvidence(base, 'I put the kettle on now.', ['kettle']))

        const records = store.evidenceForSession(session.id)

        expect(records).toHaveLength(3)
        expect(records.map(r => r.stage)).toEqual(['recall', 'recall', 'production'])
        expect(records.map(r => r.independent)).toEqual([true, false, true])
    })

    it('migration drops malformed stored entries safely', () => {
        localStorage.setItem('english-upgrade-journey', JSON.stringify({
            __version: 1,
            data: { sessions: [{ bad: true }], evidence: [{ nope: 1 }] },
        }))

        const store = useJourneyStore()

        expect(store.sessions).toEqual([])
        expect(store.evidence).toEqual([])
    })
})

describe('SRS is untouched by the journey', () => {
    it('journey store operations never write word-progress storage', () => {
        const before = localStorage.getItem('english-upgrade-word-progress')

        const store = useJourneyStore()
        const session = store.startSession(plan())
        store.completeActivity(session.id, session.plan.activities[0].id)

        expect(localStorage.getItem('english-upgrade-word-progress')).toBe(before)
    })

    it('SM-2 scheduling output is exactly what it was before this phase (reference values)', () => {
        const base = {
            wordId: 'x', courseId: '', lessonId: '', status: 'new' as const, level: 0, pos: '',
            correctAnswers: 0, wrongAnswers: 0, streak: 0, lastReviewedAt: null, nextReviewAt: null,
            practicePriority: 0, easeFactor: 2.5, intervalDays: 0,
        }

        expect(calculateNextReview(base, true).intervalDays).toBe(1)
        expect(calculateNextReview({ ...base, streak: 1, intervalDays: 1 }, true).intervalDays).toBe(6)
        expect(calculateNextReview({ ...base, streak: 3, intervalDays: 6 }, false).intervalDays).toBe(0)
    })

    it('the existing wordProgress API still drives scheduling (recordCorrect/recordWrong)', () => {
        const words = useWordProgressStore()

        words.recordCorrect('journey-word', 'c', 'l')
        expect(words.getProgress('journey-word').intervalDays).toBe(1)

        words.recordWrong('journey-word', 'c', 'l')
        expect(words.getProgress('journey-word').streak).toBe(0)
    })
})
