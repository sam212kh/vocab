import { describe, expect, it } from 'vitest'

import { planJourney } from './journeyPlanner'

import type { Exercise } from '../types/exercise'
import type { PlannerInput, RetrievalItem, ThemeCandidate } from '../types/journey'

function mc(id: string): Exercise {
    return { id, type: 'multiple-choice', skill: 'vocabulary', prompt: 'q', options: ['a', 'b'], correctIndex: 0 }
}

function dictation(id: string): Exercise {
    return { id, type: 'dictation', skill: 'listening', audioText: 'Hello there.', acceptedAnswers: ['Hello there.'] }
}

function word(english: string, due = false): RetrievalItem {
    return { english, persian: 'x', courseId: 'c', lessonId: 'l', due }
}

function theme(id: string, expressions: string[] = ['put the kettle on', 'let it steep']): ThemeCandidate {
    return {
        id,
        title: id.replace('-', ' '),
        titlePersian: 'موضوع',
        expressions: expressions.map(english => ({ english, persian: 'x', example: 'e' })),
        exercises: [mc(`${id}-1`), mc(`${id}-2`)],
        speakingSentences: ['First I put the kettle on.', 'I let it steep.'],
        constructionPrompt: {
            id: `${id}-c`, promptPersian: 'بگو', promptEnglish: 'Describe it',
            targetExpressions: ['kettle'], modelSentences: ['I put the kettle on.'],
        },
    }
}

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
    return {
        length: 'standard',
        dueWords: [],
        newWords: [],
        dueGrammarTopics: [],
        grammarExercises: [],
        themes: [],
        dictationExercises: [],
        careerQuestions: [],
        recurringMistakeCategories: [],
        weakSkills: [],
        recentlyCompleted: [],
        speakingEnabled: true,
        stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
        ...overrides,
    }
}

describe('planJourney', () => {
    it('is deterministic: identical input yields an identical plan', () => {
        const base = input({
            dueWords: [word('abandon', true), word('persist', true)],
            themes: [theme('making-tea'), theme('ordering-food')],
            grammarExercises: [{ topicId: 'articles', exercise: mc('g1') }],
            dictationExercises: [dictation('d1')],
        })

        expect(planJourney(base)).toEqual(planJourney(base))
    })

    it('empty content yields an empty plan with an explanatory note — never throws', () => {
        for (const length of ['quick', 'standard', 'extended'] as const) {
            const plan = planJourney(input({ length }))

            expect(plan.activities).toEqual([])
            expect(plan.notes.join(' ')).toMatch(/No learning content/)
        }
    })

    it('due SRS words come first (retention before novelty)', () => {
        const plan = planJourney(input({
            dueWords: [word('abandon', true)],
            themes: [theme('making-tea')],
        }))

        expect(plan.activities[0].kind).toBe('vocab-retrieval')
        expect(plan.activities[0].sourceId).toBe('due-words')
        expect(plan.activities[0].reason).toMatch(/due for spaced review/)
    })

    it('picks a coherent theme and orders it recognition → recall → production → speaking', () => {
        const plan = planJourney(input({ themes: [theme('making-tea')] }))

        const kinds = plan.activities.map(a => a.kind)

        expect(plan.theme?.id).toBe('making-tea')
        expect(kinds.indexOf('recognition-quiz')).toBeLessThan(kinds.indexOf('vocab-retrieval'))
        expect(kinds.indexOf('vocab-retrieval')).toBeLessThan(kinds.indexOf('sentence-construction'))
        expect(kinds.indexOf('sentence-construction')).toBeLessThan(kinds.indexOf('speaking'))
    })

    it('a plan is never recognition-only when richer content exists (stage balance)', () => {
        const plan = planJourney(input({ themes: [theme('making-tea')] }))

        expect(plan.activities.some(a => a.stage === 'recall')).toBe(true)
        expect(plan.activities.some(a => a.stage === 'production')).toBe(true)
    })

    it('recognition-only content is flagged in notes instead of pretending to be balanced', () => {
        const plan = planJourney(input({
            grammarExercises: [{ topicId: 'articles', exercise: mc('g1') }],
        }))

        expect(plan.activities.every(a => a.stage === 'recognition')).toBe(true)
        expect(plan.notes.join(' ')).toMatch(/Only recognition content/)
    })

    it('respects session length: quick is short with no production/speaking; extended adds hand-offs', () => {
        const rich = {
            dueWords: [word('a', true)],
            themes: [theme('making-tea')],
            grammarExercises: [{ topicId: 'articles', exercise: mc('g1') }],
            dictationExercises: [dictation('d1')],
            careerQuestions: [{ id: 'gen-01', question: 'Tell me about yourself.' }],
        }

        const quick = planJourney(input({ ...rich, length: 'quick' }))
        const standard = planJourney(input({ ...rich, length: 'standard' }))
        const extended = planJourney(input({ ...rich, length: 'extended' }))

        expect(quick.activities.length).toBeLessThanOrEqual(4)
        expect(quick.activities.some(a => a.kind === 'sentence-construction' || a.kind === 'speaking')).toBe(false)
        expect(quick.totalEstimatedMinutes).toBeLessThanOrEqual(7)

        expect(standard.activities.length).toBeGreaterThanOrEqual(4)
        expect(standard.activities.length).toBeLessThanOrEqual(6)

        expect(extended.activities.some(a => a.kind === 'roleplay')).toBe(true)
        expect(extended.activities.some(a => a.kind === 'career-question')).toBe(true)
        expect(extended.activities.length).toBeLessThanOrEqual(6)
    })

    it('skips recently completed themes and exercises (no unnecessary repeats)', () => {
        const plan = planJourney(input({
            themes: [theme('making-tea'), theme('ordering-food')],
            recentlyCompleted: ['making-tea'],
        }))

        expect(plan.theme?.id).toBe('ordering-food')

        const grammar = planJourney(input({
            grammarExercises: [{ topicId: 't', exercise: mc('g1') }, { topicId: 't', exercise: mc('g2') }],
            recentlyCompleted: ['g1'],
        }))

        const grammarActivity = grammar.activities.find(a => a.kind === 'grammar-in-context')!
        expect(grammarActivity.exercises!.map(e => e.id)).not.toContain('g1')
    })

    it('all themes recently completed → no theme, explained', () => {
        const plan = planJourney(input({ themes: [theme('making-tea')], recentlyCompleted: ['making-tea'] }))

        expect(plan.theme).toBeNull()
        expect(plan.notes.join(' ')).toMatch(/practiced recently/)
    })

    it('speaking activities are omitted when the Speaking preference is off', () => {
        const plan = planJourney(input({ themes: [theme('making-tea')], speakingEnabled: false }))

        expect(plan.activities.some(a => a.kind === 'speaking')).toBe(false)
    })

    it('Real-Life / Career are optional: vocabulary-only input still produces a plan', () => {
        const plan = planJourney(input({ newWords: [word('abandon'), word('persist')] }))

        expect(plan.theme).toBeNull()
        expect(plan.activities).toHaveLength(1)
        expect(plan.activities[0].kind).toBe('vocab-retrieval')
        expect(plan.notes.join(' ')).toMatch(/No Real-Life scenarios/)
    })

    it('theme choice prefers the scenario overlapping due words (tie → manifest order)', () => {
        const plan = planJourney(input({
            dueWords: [word('wind down', true)],
            themes: [theme('making-tea'), theme('daily-routine', ['wind down', 'wrap up work'])],
        }))

        expect(plan.theme?.id).toBe('daily-routine')

        const tie = planJourney(input({ themes: [theme('making-tea'), theme('ordering-food')] }))
        expect(tie.theme?.id).toBe('making-tea')
    })

    it('weak grammar / recurring mistakes bias toward grammar-in-context with an explanation', () => {
        const plan = planJourney(input({
            themes: [theme('making-tea')],
            grammarExercises: [{ topicId: 'present-perfect', exercise: mc('g1') }],
            recurringMistakeCategories: ['tense', 'articles'],
        }))

        const grammar = plan.activities.find(a => a.kind === 'grammar-in-context')

        expect(grammar).toBeDefined()
        expect(grammar!.reason).toMatch(/recurring tense, articles/)
    })

    it('due grammar topics are prioritized within grammar practice', () => {
        const plan = planJourney(input({
            dueGrammarTopics: ['passive-voice'],
            grammarExercises: [
                { topicId: 'articles', exercise: mc('a1') },
                { topicId: 'passive-voice', exercise: mc('p1') },
            ],
        }))

        const grammar = plan.activities.find(a => a.kind === 'grammar-in-context')!

        expect(grammar.exercises!.map(e => e.id)).toEqual(['p1'])
        expect(grammar.reason).toMatch(/passive-voice/)
    })

    it('every activity carries a non-empty explanation and a unique id', () => {
        const plan = planJourney(input({
            length: 'extended',
            dueWords: [word('a', true)],
            themes: [theme('making-tea')],
            grammarExercises: [{ topicId: 'articles', exercise: mc('g1') }],
            dictationExercises: [dictation('d1')],
            careerQuestions: [{ id: 'gen-01', question: 'Q' }],
        }))

        for (const activity of plan.activities) {
            expect(activity.reason.length).toBeGreaterThan(15)
        }

        const ids = plan.activities.map(a => a.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('does not exceed the time budget meaningfully', () => {
        const plan = planJourney(input({
            length: 'quick',
            dueWords: [word('a', true)],
            themes: [theme('making-tea')],
            grammarExercises: [{ topicId: 'articles', exercise: mc('g1') }],
        }))

        expect(plan.totalEstimatedMinutes).toBeLessThanOrEqual(7)
    })
})
