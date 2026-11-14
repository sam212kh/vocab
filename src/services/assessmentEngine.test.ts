import { describe, expect, it } from 'vitest'

import {
    createSelectorState,
    recordAnswer,
    selectNextItem,
} from './assessmentItemSelector'
import { estimateLevel } from './cefrEstimator'
import { aggregateEvidence } from './assessmentScoring'

import type { AssessmentItem } from '../types/assessment'
import type { CefrLevel } from '../types/cefr'

/** Small synthetic bank: 8 MC + 4 fill-blank per level. */
function makeBank(): AssessmentItem[] {
    const bank: AssessmentItem[] = []

    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CefrLevel[]) {
        for (let i = 0; i < 8; i++) {
            bank.push({
                id: `${level}-mc-${i}`,
                type: 'multiple-choice',
                skill: 'grammar',
                cefrLevel: level,
                prompt: 'q',
                options: ['a', 'b'],
                correctIndex: 0,
            })
        }

        for (let i = 0; i < 4; i++) {
            bank.push({
                id: `${level}-fb-${i}`,
                type: 'fill-blank',
                skill: 'grammar',
                cefrLevel: level,
                before: 'x',
                after: 'y',
                acceptedAnswers: ['z'],
            })
        }
    }

    return bank
}

function record(level: CefrLevel, itemType: string, correct: boolean) {
    return { itemId: `${level}-${itemType}-${Math.random()}`, level, itemType, correct }
}

/** n records at a level split across two types with the given correct count. */
function levelRecords(level: CefrLevel, asked: number, correct: number) {
    return Array.from({ length: asked }, (_, i) =>
        record(level, i % 2 === 0 ? 'multiple-choice' : 'fill-blank', i < correct)
    )
}

describe('assessment item selector', () => {
    it('starts at the self-reported level, defaulting to B1', () => {
        expect(createSelectorState('A2').currentLevel).toBe('A2')
        expect(createSelectorState(null).currentLevel).toBe('B1')
        expect(createSelectorState(undefined).currentLevel).toBe('B1')
    })

    it('steps up after two consecutive correct, down after two consecutive wrong', () => {
        const bank = makeBank()
        let state = createSelectorState('B1')

        const first = selectNextItem(state, bank)!
        state = recordAnswer(state, first, true)
        const second = selectNextItem(state, bank)!
        state = recordAnswer(state, second, true)

        expect(state.currentLevel).toBe('B2')

        const third = selectNextItem(state, bank)!
        state = recordAnswer(state, third, false)
        const fourth = selectNextItem(state, bank)!
        state = recordAnswer(state, fourth, false)

        expect(state.currentLevel).toBe('B1')
    })

    it('alternating answers never move the level', () => {
        const bank = makeBank()
        let state = createSelectorState('B1')

        for (let i = 0; i < 6; i++) {
            const item = selectNextItem(state, bank)!
            state = recordAnswer(state, item, i % 2 === 0)
        }

        expect(state.currentLevel).toBe('B1')
    })

    it('does not step above C2 or below A1', () => {
        const bank = makeBank()

        let top = createSelectorState('C2')
        for (let i = 0; i < 4; i++) {
            top = recordAnswer(top, selectNextItem(top, bank)!, true)
        }
        expect(top.currentLevel).toBe('C2')

        let bottom = createSelectorState('A1')
        for (let i = 0; i < 4; i++) {
            bottom = recordAnswer(bottom, selectNextItem(bottom, bank)!, false)
        }
        expect(bottom.currentLevel).toBe('A1')
    })

    it('covers item types: least-answered type is preferred at the current level', () => {
        const bank = makeBank()
        let state = createSelectorState('B1')

        const picks: string[] = []

        for (let i = 0; i < 4; i++) {
            const item = selectNextItem(state, bank)!
            picks.push(item.type)
            /* alternate correctness to stay at B1 */
            state = recordAnswer(state, item, i % 2 === 0)
        }

        expect(new Set(picks).size).toBeGreaterThan(1)
    })

    it('never repeats an item within a session', () => {
        const bank = makeBank()
        let state = createSelectorState('B1', 18)

        const seen = new Set<string>()

        for (;;) {
            const item = selectNextItem(state, bank)
            if (!item) break

            expect(seen.has(item.id)).toBe(false)
            seen.add(item.id)
            state = recordAnswer(state, item, true)
        }
    })

    it('avoids recently exposed items when alternatives exist, but uses them when the pool empties', () => {
        const bank = makeBank().filter(item => item.cefrLevel === 'B1')
        const exposedId = 'B1-fb-0'

        let state = createSelectorState('B1', 18, [exposedId])

        const picked: string[] = []
        for (;;) {
            const item = selectNextItem(state, bank)
            if (!item) break
            picked.push(item.id)
            state = recordAnswer(state, item, picked.length % 2 === 0)
        }

        /* 12 items at B1, all eventually used — exposed one must come LAST
         * among fill-blanks, not be skipped forever. */
        expect(picked).toContain(exposedId)
        const fillBlankPicks = picked.filter(id => id.includes('-fb-'))
        expect(fillBlankPicks[fillBlankPicks.length - 1]).toBe(exposedId)
    })

    it('falls back to neighbouring levels when the current level is exhausted, and terminates on empty banks', () => {
        const bank = makeBank().filter(item => item.cefrLevel !== 'B1')

        let state = createSelectorState('B1')
        const item = selectNextItem(state, bank)!

        expect(['A2', 'B2']).toContain(item.cefrLevel)

        expect(selectNextItem(createSelectorState('B1'), [])).toBeNull()
    })

    it('terminates at the item budget', () => {
        const bank = makeBank()
        let state = createSelectorState('B1', 5)

        for (let i = 0; i < 5; i++) {
            state = recordAnswer(state, selectNextItem(state, bank)!, true)
        }

        expect(selectNextItem(state, bank)).toBeNull()
    })

    it('is deterministic: identical inputs give identical selections', () => {
        const bank = makeBank()

        const run = () => {
            let state = createSelectorState('B1')
            const ids: string[] = []
            for (let i = 0; i < 10; i++) {
                const item = selectNextItem(state, bank)!
                ids.push(item.id)
                state = recordAnswer(state, item, i % 3 !== 0)
            }
            return ids
        }

        expect(run()).toEqual(run())
    })
})

describe('evidence aggregation', () => {
    it('marks untested levels as untested, never failed', () => {
        const evidence = aggregateEvidence(levelRecords('B1', 6, 5))

        expect(evidence.find(e => e.level === 'C2')!.verdict).toBe('untested')
        expect(evidence.find(e => e.level === 'A1')!.verdict).toBe('untested')
    })

    it('under-sampled levels (few items or one type) are not failures', () => {
        const oneType = Array.from({ length: 6 }, () => record('B1', 'multiple-choice', false))
        const evidence = aggregateEvidence(oneType)

        expect(evidence.find(e => e.level === 'B1')!.verdict).toBe('under-sampled')
    })

    it('classifies held / borderline / failed with sufficient evidence', () => {
        expect(aggregateEvidence(levelRecords('B1', 6, 5)).find(e => e.level === 'B1')!.verdict).toBe('held')
        expect(aggregateEvidence(levelRecords('B1', 6, 3)).find(e => e.level === 'B1')!.verdict).toBe('borderline')
        expect(aggregateEvidence(levelRecords('B1', 6, 2)).find(e => e.level === 'B1')!.verdict).toBe('failed')
    })
})

describe('CEFR ladder estimation', () => {
    it('returns the highest held level', () => {
        const records = [
            ...levelRecords('A2', 6, 6),
            ...levelRecords('B1', 6, 5),
            ...levelRecords('B2', 6, 2),
        ]

        const result = estimateLevel(records)

        expect(result.level).toBe('B1')
    })

    it('a clear failed ceiling raises confidence; an untested ceiling lowers it with a floor note', () => {
        const withCeiling = estimateLevel([...levelRecords('B1', 9, 8), ...levelRecords('B2', 6, 2)])
        const withoutCeiling = estimateLevel(levelRecords('B1', 9, 8))

        expect(withCeiling.confidence).toBeGreaterThan(withoutCeiling.confidence)
        expect(withoutCeiling.notes.join(' ')).toMatch(/floor/)
    })

    it('borderline level above reduces confidence', () => {
        const clear = estimateLevel([...levelRecords('B1', 6, 6), ...levelRecords('B2', 6, 2)])
        const borderline = estimateLevel([...levelRecords('B1', 6, 6), ...levelRecords('B2', 6, 3)])

        expect(borderline.confidence).toBeLessThan(clear.confidence)
        expect(borderline.notes.join(' ')).toMatch(/between B1 and B2/)
    })

    it('boundary accuracy (just above 70%) reduces confidence', () => {
        const comfortable = estimateLevel([...levelRecords('B1', 8, 8), ...levelRecords('B2', 6, 2)])
        /* 5/7 ≈ 71% — above the 70% hold line but below the 75% comfort line */
        const boundary = estimateLevel([...levelRecords('B1', 7, 5), ...levelRecords('B2', 6, 2)])

        expect(boundary.confidence).toBeLessThan(comfortable.confidence)
    })

    it('insufficient evidence yields null level, never a guess', () => {
        const result = estimateLevel(levelRecords('B1', 4, 4))

        expect(result.level).toBeNull()
        expect(result.evidenceQuality).toBe('insufficient')
        expect(result.confidence).toBe(0.2)
    })

    it('an all-failed session yields null level (lower levels were untested, not failed)', () => {
        const result = estimateLevel(levelRecords('B1', 6, 1))

        expect(result.level).toBeNull()
        expect(result.evidence.find(e => e.level === 'A2')!.verdict).toBe('untested')
    })

    it('confidence never exceeds 0.8 and every result carries the non-certification note', () => {
        const best = estimateLevel([
            ...levelRecords('B1', 12, 12).map((r, i) => ({ ...r, itemType: ['multiple-choice', 'fill-blank', 'short-answer'][i % 3] })),
            ...levelRecords('B2', 6, 1),
        ])

        expect(best.confidence).toBeLessThanOrEqual(0.8)
        expect(best.notes.join(' ')).toMatch(/not a certified CEFR/)
    })

    it('evidence quality grades with volume and coverage', () => {
        const good = estimateLevel([
            ...levelRecords('B1', 12, 11).map((r, i) => ({ ...r, itemType: ['multiple-choice', 'fill-blank', 'short-answer'][i % 3] })),
            ...levelRecords('B2', 6, 2),
        ])
        const low = estimateLevel([...levelRecords('B1', 6, 5)])

        expect(good.evidenceQuality).toBe('good')
        expect(low.evidenceQuality).toBe('low')
    })
})
