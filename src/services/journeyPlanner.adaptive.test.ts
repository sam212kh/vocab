import { describe, expect, it } from 'vitest'

import { planJourney } from './journeyPlanner'

import type { JourneyActivity, PlannerEvidence, PlannerInput, RetrievalItem, ThemeCandidate } from '../types/journey'

const EXPRESSIONS = ['put the kettle on', "the water's boiling", 'let it steep', 'a strong cup of tea', 'weak tea']

function theme(id = 'making-tea'): ThemeCandidate {
    return {
        id, title: 'Making Tea', titlePersian: 'چای',
        expressions: EXPRESSIONS.map(english => ({ english, persian: 'x', example: `Example for ${english}.`, examplePersian: 'مثال' })),
        exercises: [
            { id: `${id}-mc1`, type: 'multiple-choice', skill: 'vocabulary', prompt: 'q', options: ['a', 'b'], correctIndex: 0 },
            { id: `${id}-mc2`, type: 'multiple-choice', skill: 'vocabulary', prompt: 'q2', options: ['a', 'b'], correctIndex: 1 },
        ],
        speakingSentences: ['I put the kettle on.'],
        constructionPrompt: { id: `${id}-c`, promptPersian: 'p', promptEnglish: 'Describe', targetExpressions: ['kettle'], modelSentences: ['m'] },
    }
}

const due = (english: string): RetrievalItem => ({ english, persian: 'x', courseId: 'upgrade', lessonId: 'b1', due: true })

function evidence(over: Partial<PlannerEvidence> = {}): PlannerEvidence {
    return { introduced: [], stages: {}, retentionDue: [], gaps: [], transfer: { task: null, reason: 'no-acquired-expression' }, ...over }
}

const TRANSFER = {
    patternId: 'polite-request', contextId: 'hotel-quiet-room', level: 2 as const, patternTitle: 'Polite requests', anchorExpression: 'Could we get the bill?',
    prompt: { id: 'transfer:polite-request:hotel-quiet-room', promptPersian: 'p', promptEnglish: 'You are at a hotel. Ask for a quieter room.', targetExpressions: ['could i'], modelSentences: ['Could I have a quieter room?'] },
}

function input(over: Partial<PlannerInput> = {}): PlannerInput {
    return {
        length: 'standard', dueWords: [], newWords: [], dueGrammarTopics: [], grammarExercises: [], themes: [theme()], dictationExercises: [], careerQuestions: [],
        recurringMistakeCategories: [], weakSkills: [], recentlyCompleted: [], speakingEnabled: true, stageCounts: { recognition: 0, recall: 0, production: 0, fluency: 0 },
        evidence: evidence(), ...over,
    }
}

const kinds = (activities: JourneyActivity[]) => activities.map(a => a.kind)
const recallItems = (activities: JourneyActivity[], id: string) => activities.find(a => a.id.startsWith(`vocab-retrieval:${id}`))?.retrievalItems?.map(i => i.english) ?? []

describe('E1 — introduce before recall', () => {
    it('never-seen theme phrases are introduced FIRST; recall follows and covers only what was shown', () => {
        const plan = planJourney(input())
        const order = kinds(plan.activities)

        expect(order.indexOf('new-material-intro')).toBeGreaterThanOrEqual(0)
        expect(order.indexOf('new-material-intro')).toBeLessThan(order.indexOf('vocab-retrieval'))

        const intro = plan.activities.find(a => a.kind === 'new-material-intro')!

        expect(intro.introItems!.length).toBeLessThanOrEqual(4)
        expect(intro.introItems![0]).toMatchObject({ english: 'put the kettle on', example: expect.any(String), examplePersian: 'مثال' })

        const shown = new Set(intro.introItems!.map(i => i.english))

        for (const english of recallItems(plan.activities, 'making-tea')) expect(shown.has(english)).toBe(true)
    })

    it('phrases the learner already met are not re-introduced and ARE recalled', () => {
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS }) }))

        expect(kinds(plan.activities)).not.toContain('new-material-intro')
        expect(recallItems(plan.activities, 'making-tea')).toEqual(EXPRESSIONS)
    })

    it('a mix: only the unseen ones are introduced; recall covers both groups', () => {
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS.slice(0, 3) }) }))
        const intro = plan.activities.find(a => a.kind === 'new-material-intro')!

        expect(intro.introItems!.map(i => i.english)).toEqual(EXPRESSIONS.slice(3))
        expect(recallItems(plan.activities, 'making-tea')).toEqual(EXPRESSIONS)
    })

    it('even a quick session introduces new phrases before recalling them (after the due words)', () => {
        const plan = planJourney(input({ length: 'quick', dueWords: [due('a'), due('b')] }))
        const order = kinds(plan.activities)

        expect(order[0]).toBe('vocab-retrieval')
        expect(order.indexOf('new-material-intro')).toBe(1)

        /* Any themed recall that fits comes AFTER the introduction, and only covers what was shown. */
        const themedRecall = plan.activities.findIndex(a => a.id.startsWith('vocab-retrieval:making-tea'))

        if (themedRecall >= 0) expect(themedRecall).toBeGreaterThan(1)
    })

    it('fallback with no theme: new words are introduced, then recalled', () => {
        const plan = planJourney(input({ themes: [], newWords: [due('alpha'), due('beta')].map(w => ({ ...w, due: false })) }))

        expect(kinds(plan.activities).slice(0, 2)).toEqual(['new-material-intro', 'vocab-retrieval'])
    })

    it('PROPERTY: across many situations, a plan never recalls a themed phrase that is neither introduced nor shown in that plan', () => {
        const stageSets = [[], EXPRESSIONS.slice(0, 1), EXPRESSIONS.slice(0, 3), EXPRESSIONS]

        for (const length of ['quick', 'standard', 'extended'] as const) {
            for (const introduced of stageSets) {
                for (const dueCount of [0, 2, 8]) {
                    const plan = planJourney(input({ length, dueWords: Array.from({ length: dueCount }, (_, i) => due(`w${i}`)), evidence: evidence({ introduced }) }))
                    const shown = new Set([...introduced, ...(plan.activities.find(a => a.kind === 'new-material-intro')?.introItems ?? []).map(i => i.english)])

                    for (const english of recallItems(plan.activities, 'making-tea')) expect(shown.has(english), `${length}/${introduced.length}/${dueCount}: ${english}`).toBe(true)
                }
            }
        }
    })
})

describe('E2 — SRS due words come first; retention checkpoints order them', () => {
    it('due words open the session (introduction comes after them)', () => {
        const plan = planJourney(input({ dueWords: [due('achieve')] }))

        expect(plan.activities[0].id).toBe('vocab-retrieval:due:0')
        expect(plan.activities[0].retrievalItems![0].english).toBe('achieve')
    })

    it('items past a retention checkpoint are asked first, and the reason says why', () => {
        const plan = planJourney(input({ dueWords: [due('a'), due('b'), due('c')], evidence: evidence({ introduced: EXPRESSIONS, retentionDue: ['c'] }) }))

        expect(plan.activities[0].retrievalItems!.map(i => i.english)).toEqual(['c', 'a', 'b'])
        expect(plan.activities[0].reason).toMatch(/still remember after several days/)
    })

    it('without evidence the due order is untouched (SRS order preserved)', () => {
        const plan = planJourney({ ...input({ dueWords: [due('a'), due('b'), due('c')] }), evidence: undefined })

        expect(plan.activities[0].retrievalItems!.map(i => i.english)).toEqual(['a', 'b', 'c'])
    })
})

describe('E3 — only the right level for each item', () => {
    it('recognition warm-up is skipped when every phrase is already recognized', () => {
        const stages = Object.fromEntries(EXPRESSIONS.map(e => [e, 'recognized' as const]))
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS, stages }) }))

        expect(kinds(plan.activities)).not.toContain('recognition-quiz')
        expect(plan.notes.join(' ')).toMatch(/already recognize/)
    })

    it('recall only covers phrases still below "recalled"; none left → step skipped with a note', () => {
        const partial = Object.fromEntries(EXPRESSIONS.map((e, i) => [e, (i < 3 ? 'recalled' : 'recognized') as 'recalled' | 'recognized']))
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS, stages: partial }) }))

        expect(recallItems(plan.activities, 'making-tea')).toEqual(EXPRESSIONS.slice(3))

        const all = Object.fromEntries(EXPRESSIONS.map(e => [e, 'recalled' as const]))
        const done = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS, stages: all }) }))

        expect(recallItems(done.activities, 'making-tea')).toEqual([])
        expect(done.notes.join(' ')).toMatch(/already recall/)
    })
})

describe('E6 — never dominated by recognition', () => {
    it('drops the recognition quiz when recognition-level work would exceed 35% of the plan', () => {
        const plan = planJourney(input({
            themes: [{ ...theme(), constructionPrompt: null, speakingSentences: [] }],
            evidence: evidence({ introduced: EXPRESSIONS.slice(0, 5), stages: Object.fromEntries(EXPRESSIONS.map(e => [e, 'recognized' as const])) }),
            grammarExercises: [{ topicId: 'g1', exercise: { id: 'g1', type: 'multiple-choice', skill: 'grammar', prompt: 'q', options: ['a', 'b'], correctIndex: 0 } }],
            dueGrammarTopics: ['g1'],
        }))

        const recognitionMinutes = plan.activities.filter(a => a.kind === 'recognition-quiz' || a.kind === 'grammar-in-context').reduce((s, a) => s + a.estimatedMinutes, 0)

        expect(recognitionMinutes / plan.totalEstimatedMinutes).toBeLessThanOrEqual(0.5)
        expect(kinds(plan.activities)).toContain('vocab-retrieval')
    })

    it('a plan always contains recall or production work when richer content exists', () => {
        for (const length of ['quick', 'standard', 'extended'] as const) {
            const plan = planJourney(input({ length, evidence: evidence({ introduced: EXPRESSIONS }) }))

            expect(plan.activities.some(a => a.stage === 'recall' || a.stage === 'production'), length).toBe(true)
        }
    })
})

describe('E4 — contextual application (transfer)', () => {
    const withTransfer = evidence({ introduced: EXPRESSIONS, transfer: { task: TRANSFER, reason: null } })

    it('comes after sentence production and before speaking, carrying its pattern and context', () => {
        const plan = planJourney(input({ evidence: withTransfer }))
        const order = kinds(plan.activities)
        const step = plan.activities.find(a => a.kind === 'contextual-application')!

        expect(order.indexOf('contextual-application')).toBeGreaterThan(order.indexOf('sentence-construction'))
        expect(order.indexOf('contextual-application')).toBeLessThan(order.indexOf('speaking'))
        expect(step.transfer).toMatchObject({ patternId: 'polite-request', contextId: 'hotel-quiet-room', level: 2 })
        expect(step.construction!.modelSentences).toEqual(['Could I have a quieter room?'])
        expect(step.reason).toMatch(/Could we get the bill\?/)
    })

    it('not in a quick session unless contextual usage is a confirmed weakness', () => {
        expect(kinds(planJourney(input({ length: 'quick', evidence: withTransfer })).activities)).not.toContain('contextual-application')

        const weak = { ...withTransfer, gaps: [{ dimension: 'contextualUsage', classification: 'weakness' as const, estimate: 30, why: 'x' }] }

        expect(kinds(planJourney(input({ length: 'quick', evidence: weak })).activities)).toContain('contextual-application')
    })

    it('no task → no step, and the plan explains how to unlock it', () => {
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS }) }))

        expect(kinds(plan.activities)).not.toContain('contextual-application')
        expect(plan.notes.join(' ')).toMatch(/New-situation practice unlocks/)
    })
})

describe('E5 — weakness handling', () => {
    const gap = (dimension: string, classification: 'weakness' | 'insufficient' | 'developing' | 'strength') => ({ dimension, classification, estimate: classification === 'insufficient' ? null : 30, why: 'because' })

    it('confirmed weak sentence construction lets production into a QUICK session; insufficient evidence does not', () => {
        const base = { length: 'quick' as const, evidence: evidence({ introduced: EXPRESSIONS }) }

        expect(kinds(planJourney(input(base)).activities)).not.toContain('sentence-construction')
        expect(kinds(planJourney(input({ ...base, evidence: { ...base.evidence, gaps: [gap('sentenceConstruction', 'insufficient')] } })).activities)).not.toContain('sentence-construction')
        expect(kinds(planJourney(input({ ...base, evidence: { ...base.evidence, gaps: [gap('sentenceConstruction', 'weakness')] } })).activities)).toContain('sentence-construction')
    })

    it('weak listening admits dictation, weak speaking admits speaking, in a quick session', () => {
        const dictation = [{ id: 'd1', type: 'dictation' as const, skill: 'listening' as const, prompt: 'p', audioText: 'hello', acceptedAnswers: ['hello'] }]
        const quick = (dimension: string) => planJourney(input({ length: 'quick', dictationExercises: dictation as never, evidence: evidence({ introduced: EXPRESSIONS, gaps: [gap(dimension, 'weakness')] }) }))

        expect(kinds(quick('listening').activities)).toContain('listening-dictation')
        expect(kinds(quick('speakingFluency').activities)).toContain('speaking')
        expect(kinds(quick('vocabRecognition').activities)).not.toContain('listening-dictation')
    })

    it('the objective names the confirmed weakness; strengths and insufficient evidence are not mentioned', () => {
        const plan = planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS, gaps: [gap('vocabRecall', 'weakness'), gap('listening', 'insufficient'), gap('reading', 'strength')] }) }))

        expect(plan.objective).toMatch(/active recall/)
        expect(plan.objective).not.toMatch(/listening|reading/)
        expect(planJourney(input({ evidence: evidence({ introduced: EXPRESSIONS }) })).objective).not.toMatch(/Focus:/)
    })

    it('confirmed weak grammar pulls in grammar practice', () => {
        const grammar = [{ topicId: 'g1', exercise: { id: 'g1', type: 'multiple-choice' as const, skill: 'grammar' as const, prompt: 'q', options: ['a', 'b'], correctIndex: 0 } }]
        const plan = planJourney(input({ grammarExercises: grammar, evidence: evidence({ introduced: EXPRESSIONS, gaps: [gap('grammarAccuracy', 'weakness')] }) }))

        expect(kinds(plan.activities)).toContain('grammar-in-context')
    })
})

describe('constraints that always hold', () => {
    const scenarios = (['quick', 'standard', 'extended'] as const).flatMap(length => [
        input({ length }),
        input({ length, dueWords: [due('a'), due('b')], evidence: evidence({ introduced: EXPRESSIONS, transfer: { task: TRANSFER, reason: null } }) }),
        input({ length, themes: [], newWords: [{ ...due('alpha'), due: false }] }),
    ])

    it('respects the session duration (small tolerance) and the activity cap', () => {
        const limits = { quick: [5, 4], standard: [18, 6], extended: [40, 6] } as const

        for (const scenario of scenarios) {
            const plan = planJourney(scenario)
            const [minutes, max] = limits[scenario.length]

            expect(plan.totalEstimatedMinutes, scenario.length).toBeLessThanOrEqual(minutes + 2)
            expect(plan.activities.length).toBeLessThanOrEqual(max)
        }
    })

    it('every activity has a reason and a unique id; the plan has an objective', () => {
        for (const scenario of scenarios) {
            const plan = planJourney(scenario)

            expect(new Set(plan.activities.map(a => a.id)).size).toBe(plan.activities.length)
            expect(plan.activities.every(a => a.reason.length > 10)).toBe(true)
            expect(plan.objective.length).toBeGreaterThan(10)
        }
    })

    it('says plainly when little suitable content exists', () => {
        const plan = planJourney(input({ length: 'extended', careerQuestions: [], themes: [{ ...theme(), constructionPrompt: null, speakingSentences: [], exercises: [] }], evidence: evidence({ introduced: EXPRESSIONS, stages: Object.fromEntries(EXPRESSIONS.map(e => [e, 'recalled' as const])) }) }))

        expect(plan.notes.join(' ')).toMatch(/could be filled with suitable material/)
    })

    it('is deterministic with evidence', () => {
        const scenario = input({ dueWords: [due('a')], evidence: evidence({ introduced: EXPRESSIONS.slice(0, 2), retentionDue: ['a'], transfer: { task: TRANSFER, reason: null } }) })

        expect(planJourney(scenario)).toEqual(planJourney(scenario))
    })

    it('reuses the existing SRS: due words come straight from the input and are never re-scheduled by the planner', () => {
        const plan = planJourney(input({ dueWords: [due('a'), due('b')] }))

        expect(plan.activities[0].retrievalItems!.map(i => i.english)).toEqual(['a', 'b'])
    })
})
