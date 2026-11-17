import { describe, expect, it } from 'vitest'

import { DAY_MS, emptyCounts } from './evidenceEngine'
import { TRANSFER_LEVEL_STEP, acquiredAnchors, attemptsFromLedger, basicTransferCheck, matchedPhrases, patternMatches, patternProgress, selectTransferTask } from './transfer'

import type { ItemEvidence } from '../types/evidence'
import type { LearnedExpression, TransferAttempt, TransferPattern } from '../types/transfer'

const NOW = 400 * DAY_MS

const ctx = (id: string, level: 1 | 2 | 3, over: Partial<TransferPattern['contexts'][number]> = {}): TransferPattern['contexts'][number] => ({
    id, level, situation: `Situation ${id}.`, situationPersian: 'موقعیت', goal: `Goal ${id}.`, goalPersian: 'هدف',
    targetPhrases: ['could i'], references: ['Could I have a thing, please?'], ...over,
})

const POLITE: TransferPattern = {
    id: 'polite', title: 'Polite requests', titlePersian: 'درخواست', frame: 'Could I …', matches: ["\\b(could|can) (i|we) (have|get)\\b", "\\bi'?d like\\b"],
    contexts: [ctx('c1', 1), ctx('c2', 1), ctx('c3', 2), ctx('c4', 2), ctx('c5', 3, { open: true })],
}
const HELP: TransferPattern = { id: 'help', title: 'Help', titlePersian: 'کمک', frame: 'Can you …', matches: ['\\bcan you\\b'], contexts: [ctx('h1', 1), ctx('h2', 2)] }

const learned = (text: string, stage: LearnedExpression['stage']): LearnedExpression => ({ key: `lex:${text.toLowerCase()}`, text, stage })
const attempt = (patternId: string, contextId: string, ok: boolean, over: Partial<TransferAttempt> = {}): TransferAttempt => ({ patternId, contextId, ok, independent: true, verified: true, t: NOW - DAY_MS * 3, ...over })

describe('anchors: transfer follows acquisition', () => {
    it('matches learned expressions by pattern', () => {
        expect(patternMatches(POLITE, 'Could we get the bill?')).toBe(true)
        expect(patternMatches(POLITE, "I'd like a coffee")).toBe(true)
        expect(patternMatches(POLITE, 'put the kettle on')).toBe(false)
    })

    it('only recalled-or-better expressions count as acquired (exposed/recognized do not)', () => {
        const items = [learned('Could we get the bill?', 'exposed'), learned("I'd like a cup of coffee", 'recognized'), learned('Can I have the menu?', 'recalled')]

        expect(acquiredAnchors(POLITE, items).map(a => a.text)).toEqual(['Can I have the menu?'])
    })
})

describe('task selection', () => {
    it('nothing acquired → no task, with the reason (never a made-up prompt)', () => {
        expect(selectTransferTask({ patterns: [POLITE], learned: [learned('Could we get the bill?', 'recognized')], history: [], now: NOW })).toEqual({ task: null, reason: 'no-acquired-expression' })
        expect(selectTransferTask({ patterns: [], learned: [], history: [], now: NOW })).toEqual({ task: null, reason: 'no-content' })
    })

    it('builds a situation-and-goal prompt in English and Persian, anchored to the learned expression', () => {
        const { task } = selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like a cup of coffee", 'produced')], history: [], now: NOW })

        expect(task).toMatchObject({ patternId: 'polite', contextId: 'c1', level: 1, anchorExpression: "I'd like a cup of coffee", open: false })
        expect(task!.prompt.promptEnglish).toBe('Situation c1. Goal c1.')
        expect(task!.prompt.promptPersian).toMatch(/[؀-ۿ]/)
        expect(task!.prompt.id).toBe('transfer:polite:c1')
    })

    it('progresses: new contexts first, never a context already succeeded in', () => {
        const history = [attempt('polite', 'c1', true)]
        const { task } = selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like tea", 'recalled')], history, now: NOW })

        expect(task!.contextId).toBe('c2')
    })

    it('difficulty rises with success (2 successful contexts → level 2, 4 → level 3)', () => {
        expect(patternProgress('polite', []).level).toBe(1)
        expect(patternProgress('polite', [attempt('polite', 'c1', true), attempt('polite', 'c2', true)]).level).toBe(2)
        expect(patternProgress('polite', ['c1', 'c2', 'c3', 'c4'].map(c => attempt('polite', c, true))).level).toBe(3)
        expect(TRANSFER_LEVEL_STEP).toBe(2)

        const after2 = selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like tea", 'recalled')], history: [attempt('polite', 'c1', true), attempt('polite', 'c2', true)], now: NOW })

        expect(after2.task!.level).toBe(2)
    })

    it('the final level asks about the learner\'s own life', () => {
        const history = ['c1', 'c2', 'c3', 'c4'].map(c => attempt('polite', c, true))
        const { task } = selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like tea", 'recalled')], history, now: NOW })

        expect(task).toMatchObject({ contextId: 'c5', level: 3, open: true })
    })

    it('assisted or unverified successes do not unlock harder situations', () => {
        const history = [attempt('polite', 'c1', true, { independent: false }), attempt('polite', 'c2', true, { verified: false })]

        expect(patternProgress('polite', history)).toMatchObject({ successfulContexts: [], level: 1, transferred: false })
    })

    it('a context that failed recently is not repeated immediately, but returns after a day', () => {
        const base = { patterns: [{ ...POLITE, contexts: [ctx('c1', 1)] }], learned: [learned("I'd like tea", 'recalled')] }

        expect(selectTransferTask({ ...base, history: [attempt('polite', 'c1', false, { t: NOW - 3600000 })], now: NOW }).reason).toBe('all-contexts-done')
        expect(selectTransferTask({ ...base, history: [attempt('polite', 'c1', false, { t: NOW - 2 * DAY_MS })], now: NOW }).task?.contextId).toBe('c1')
    })

    it('respects recent contexts (no-repeat across journeys)', () => {
        const { task } = selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like tea", 'recalled')], history: [], recentContextIds: ['c1', 'c2'], now: NOW })

        expect(task!.contextId).toBe('c3')
    })

    it('practises the least-transferred pattern first', () => {
        const items = [learned("I'd like tea", 'recalled'), learned('Can you help me?', 'recalled')]
        const history = [attempt('polite', 'c1', true), attempt('polite', 'c2', true)]

        expect(selectTransferTask({ patterns: [POLITE, HELP], learned: items, history, now: NOW }).task!.patternId).toBe('help')
    })

    it('is deterministic', () => {
        const input = { patterns: [POLITE, HELP], learned: [learned("I'd like tea", 'recalled')], history: [], now: NOW }

        expect(selectTransferTask(input)).toEqual(selectTransferTask(input))
    })

    it('every context exhausted → all-contexts-done', () => {
        const history = POLITE.contexts.map(c => attempt('polite', c.id, true))

        expect(selectTransferTask({ patterns: [POLITE], learned: [learned("I'd like tea", 'recalled')], history, now: NOW }).reason).toBe('all-contexts-done')
    })
})

describe('tracking transfer', () => {
    it('transferred = two independent verified successes in two DIFFERENT contexts', () => {
        expect(patternProgress('polite', [attempt('polite', 'c1', true), attempt('polite', 'c1', true)]).transferred).toBe(false)
        expect(patternProgress('polite', [attempt('polite', 'c1', true), attempt('polite', 'c2', true)]).transferred).toBe(true)
    })

    it('rebuilds attempts from the evidence ledger (pattern items, application entries only)', () => {
        const items: ItemEvidence[] = [
            { key: 'pattern:polite', kind: 'pattern', firstSeenAt: 0, lastAt: 0, counts: emptyCounts(), exposures: 0, entries: [
                { t: 1, mode: 'application', ok: true, independent: true, verified: true, ctx: 'c1' },
                { t: 2, mode: 'application', ok: false, independent: true, verified: true, ctx: 'c2' },
                { t: 3, mode: 'view', ok: null, independent: true, verified: true, ctx: 'c3' },
                { t: 4, mode: 'application', ok: true, independent: true, verified: true },
            ] },
            { key: 'lex:other', kind: 'word', firstSeenAt: 0, lastAt: 0, counts: emptyCounts(), exposures: 0, entries: [{ t: 1, mode: 'application', ok: true, independent: true, verified: true, ctx: 'x' }] },
        ]

        expect(attemptsFromLedger(items)).toEqual([
            { patternId: 'polite', contextId: 'c1', ok: true, independent: true, verified: true, t: 1 },
            { patternId: 'polite', contextId: 'c2', ok: false, independent: true, verified: true, t: 2 },
        ])
    })
})

describe('valid alternatives and the offline check', () => {
    const context = ctx('c1', 1, { targetPhrases: ['could i'] })

    it('the shallow check recognises the pattern or a target phrase, requires a real sentence — and is only ever recorded as unverified', () => {
        expect(basicTransferCheck('Could I have a quieter room, please?', POLITE, context)).toBe(true)
        expect(basicTransferCheck("I'd like a quieter room.", POLITE, context)).toBe(true)
        expect(basicTransferCheck('Quiet room.', POLITE, context)).toBe(false)
        expect(basicTransferCheck('Please give me a different bedroom tonight.', POLITE, context)).toBe(false)
    })

    it('an equally valid wording the shallow check cannot see is not penalised as "wrong" by the engine: only the AI evaluator may judge it', () => {
        /* "Would it be possible to…" is valid English but matches no pattern; the basic check says false,
           which is why a basic result is stored unverified and never counts for or against anything. */
        expect(basicTransferCheck('Would it be possible to get a quieter room?', POLITE, context)).toBe(false)
    })
})

describe('basic (non-AI) transfer check', () => {
    const context = ctx('c1', 1)

    it('accepts any wording of the pattern, not only the context target phrases', () => {
        expect(basicTransferCheck('Could we get two coffees, please?', POLITE, context)).toBe(true)
        expect(basicTransferCheck("I'd like a glass of water please", POLITE, context)).toBe(true)
    })

    it('rejects too-short answers and answers that use neither the pattern nor a target phrase', () => {
        expect(basicTransferCheck('Could we get', POLITE, context)).toBe(false)
        expect(basicTransferCheck('Water is very important for health', POLITE, context)).toBe(false)
    })

    it('reports what it recognised', () => {
        expect(matchedPhrases(POLITE, 'Could we get two coffees?')).toEqual(['Could we get'])
        expect(matchedPhrases(POLITE, 'Water please')).toEqual([])
    })
})
