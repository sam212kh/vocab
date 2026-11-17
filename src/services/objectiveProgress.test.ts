import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts, summarizeItem } from './evidenceEngine'
import { goalProgress, goalsSummary, routeFor } from './objectiveProgress'
import { rankThemes } from './themeRanking'

import type { EvidenceEntry, EvidenceMode, ItemEvidence } from '../types/evidence'
import type { ThemeCandidate } from '../types/journey'
import type { ObjectiveIndexEntry } from '../types/objectives'

const NOW = 700 * DAY_MS
const entry = (daysAgo: number, mode: EvidenceMode, ok: boolean | null, ctx?: string): EvidenceEntry => ({ t: NOW - daysAgo * DAY_MS, mode, ok, independent: true, verified: true, ...(ctx ? { ctx } : {}) })
const summary = (key: string, entries: EvidenceEntry[]) => {
    const item: ItemEvidence = { key, kind: key.startsWith('lex:') ? 'expression' : 'objective', firstSeenAt: entries[0]?.t ?? 0, lastAt: entries.at(-1)?.t ?? 0, counts: emptyCounts(), exposures: 0, entries }

    return summarizeItem(item, NOW)
}

const goal = (over: Partial<ObjectiveIndexEntry> = {}): ObjectiveIndexEntry => ({
    topic: 'real-life/asking-for-help', area: 'real-life', topicTitle: 'Asking for help', cefr: 'A2', id: 'ask-help', text: 'Ask politely for help',
    targets: ['Could you help me?', 'Can you show me the way?'], exercises: { recognition: 1, recall: 1, sentence: 1 }, ...over,
})

const recalled = (key: string) => summary(key, [entry(9, 'recall', true), entry(2, 'recall', true)])

describe('goal progress', () => {
    it('no evidence → not started, even though exercises exist', () => {
        const [result] = goalProgress([goal()], [])

        expect(result.status).toBe('not-started')
        expect(result.next?.to).toBe('/real-life?scenario=asking-for-help&step=see')
    })

    it('only seen → started; three recognitions → recognizes, and typed practice is offered', () => {
        expect(goalProgress([goal()], [summary('lex:could you help me?', [entry(1, 'view', null)])])[0].status).toBe('started')

        const recognizing = goalProgress([goal()], [summary('lex:could you help me?', [entry(3, 'recognition', true), entry(2, 'recognition', true), entry(1, 'recognition', true)])])[0]

        expect(recognizing.status).toBe('recognizes')
        expect(recognizing.next).toEqual({ label: 'Practise typing it', to: '/real-life?scenario=asking-for-help&step=practice' })
    })

    it('recognises but offers no typing step when the goal has no typed exercise', () => {
        const [result] = goalProgress([goal({ exercises: { recognition: 3, recall: 0, sentence: 0 } })], [summary('lex:could you help me?', [entry(3, 'recognition', true), entry(2, 'recognition', true), entry(1, 'recognition', true)])])

        expect(result.status).toBe('recognizes')
        expect(result.next).toBeNull()
    })

    it('recalled on two days → recalls; half the targets is enough', () => {
        const [result] = goalProgress([goal()], [recalled('lex:could you help me?')])

        expect(result.status).toBe('recalls')
        expect(result.targets).toMatchObject({ total: 2, recalled: 1 })
        expect(result.next?.to).toBe('/daily-journey')
    })

    it('a produced target means the goal is being used', () => {
        const produced = summary('lex:could you help me?', [entry(9, 'recall', true), entry(8, 'recall', true), entry(2, 'production', true, 'prompt-a'), entry(1, 'production', true, 'prompt-b')])

        expect(produced.ladderStage).toBe('produced')
        expect(goalProgress([goal()], [produced])[0].status).toBe('uses')
    })

    it('hint-assisted answers do not move a goal forward', () => {
        const assisted = summary('lex:could you help me?', [{ ...entry(3, 'recall', true), independent: false }, { ...entry(2, 'recall', true), independent: false }])

        expect(goalProgress([goal()], [assisted])[0].status).not.toBe('recalls')
    })

    it('objective-level evidence counts even when the goal has no target expressions (grammar)', () => {
        const grammar = goal({ topic: 'grammar/present-simple', area: 'grammar', targets: [], id: 'ps-habits' })
        const own = summary('objective:grammar/present-simple#ps-habits', [entry(9, 'recall', true), entry(2, 'recall', true)])
        const [result] = goalProgress([grammar], [own])

        expect(result.status).toBe('recalls')
        expect(routeFor(grammar)).toBe('/grammar')
    })

    it('a retained expression is recalled, not "used": retention is about time, not production', () => {
        const retained = summary('lex:could you help me?', [entry(20, 'recall', true), entry(10, 'recall', true), entry(1, 'recall', true)])

        expect(retained.stage).toBe('retained')
        expect(goalProgress([goal()], [retained])[0].status).toBe('recalls')
    })

    it('summarises goals by status', () => {
        const goals = goalProgress([goal(), goal({ id: 'b', targets: ['x'] })], [recalled('lex:could you help me?')])

        expect(goalsSummary(goals)).toEqual({ total: 2, started: 1, recognizes: 0, recalls: 1, uses: 0 })
    })
})

describe('theme ranking', () => {
    const theme = (id: string, cefrLevel: string, ...expressions: string[]): ThemeCandidate => ({
        id, title: id, titlePersian: 'ی', cefrLevel, expressions: expressions.map(english => ({ english, persian: 'ی', example: 'e', examplePersian: 'ی' })),
        exercises: [], speakingSentences: [], constructionPrompt: null,
    })
    const themes = [theme('b2-negotiating', 'B2', 'we would be willing to'), theme('a1-greetings', 'A1', 'nice to meet you'), theme('a2-plans', 'A2', 'shall we meet at six?'), theme('b1-opinions', 'B1', 'in my opinion')]

    it('an A1 learner starts with A1 content, a B1 learner with B1, both ahead of harder themes', () => {
        expect(rankThemes(themes, { level: 'A1', stages: {}, index: [] })[0].id).toBe('a1-greetings')
        expect(rankThemes(themes, { level: 'B1', stages: {}, index: [] })[0].id).toBe('b1-opinions')
        expect(rankThemes(themes, { level: 'A1', stages: {}, index: [] }).at(-1)!.id).toBe('b2-negotiating')
    })

    it('slightly easier content ranks before harder content at the same distance', () => {
        const order = rankThemes(themes, { level: 'B1', stages: {}, index: [] }).map(item => item.id)

        expect(order.indexOf('a2-plans')).toBeLessThan(order.indexOf('b2-negotiating'))
    })

    it('a fully recalled theme goes last; a started theme comes before an untouched one of the same level', () => {
        const same = [theme('fresh', 'A2', 'one'), theme('started', 'A2', 'two', 'three'), theme('done', 'A2', 'four')]
        const stages = { two: 'recognized', four: 'recalled' }
        const order = rankThemes(same, { level: 'A2', stages, index: [] }).map(item => item.id)

        expect(order).toEqual(['started', 'fresh', 'done'])
    })

    it('uses the goal targets from the objective index when present', () => {
        const withGoal = [theme('t1', 'A2', 'expression one'), theme('t2', 'A2', 'expression two')]
        const index = [goal({ topic: 'real-life/t1', targets: ['goal target'] })]
        const order = rankThemes(withGoal, { level: 'A2', stages: { 'goal target': 'recalled' }, index }).map(item => item.id)

        expect(order[0]).toBe('t2')
    })

    it('an unknown level behaves like B1, and an untagged theme is never penalised', () => {
        expect(rankThemes(themes, { level: null, stages: {}, index: [] })[0].id).toBe('b1-opinions')
        expect(rankThemes([theme('x', '', 'a'), theme('y', 'B2', 'b')], { level: 'A1', stages: {}, index: [] })[0].id).toBe('x')
    })

    it('keeps the original order when nothing separates the themes, and never mutates its input', () => {
        const same = [theme('a', 'A2', 'a'), theme('b', 'A2', 'b'), theme('c', 'A2', 'c')]
        const before = same.map(item => item.id)

        expect(rankThemes(same, { level: 'A2', stages: {}, index: [] }).map(item => item.id)).toEqual(['a', 'b', 'c'])
        expect(same.map(item => item.id)).toEqual(before)
    })
})
