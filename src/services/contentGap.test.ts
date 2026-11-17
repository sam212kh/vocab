import { describe, expect, it } from 'vitest'

// @ts-expect-error plain .mjs loader shared with the content scripts
import { loadRepoContent } from '../../scripts/content-load.mjs'

import { analyseContent, bandsOf, cefrCoverage, reachOf, repetition, topicCoverage } from './contentGap'
import { coverageReport, gapInputFromContent, objectiveIndex } from './contentCoverage'
import type { RepoContent } from './contentValidation'
import type { GapInput, TopicInput, VocabCourseInput } from './contentGap'

const topic = (over: Partial<TopicInput> = {}): TopicInput => ({
    id: 't', area: 'grammar', exercises: [], objectives: [], examples: 0, hasSpeakingTask: false, hasRoleplay: false, ...over,
})
const exercise = (hasOptions: boolean, over = {}) => ({ type: hasOptions ? 'multiple-choice' : 'fill-blank', skill: 'grammar', hasOptions, audio: false, ...over })

describe('bandsOf', () => {
    it('expands ranges and rejects unknown labels', () => {
        expect(bandsOf('B1')).toEqual(['B1'])
        expect(bandsOf('A2-B1')).toEqual(['A2', 'B1'])
        expect(bandsOf('B2-C1')).toEqual(['B2', 'C1'])
        expect(bandsOf('Intermediate')).toEqual([])
        expect(bandsOf(null)).toEqual([])
        expect(bandsOf('')).toEqual([])
    })
})

describe('cefrCoverage', () => {
    it('counts ranges in every band, flags untagged items and holes inside the span only', () => {
        const [row] = cefrCoverage([
            { area: 'a', cefr: 'A2' }, { area: 'a', cefr: 'B2' }, { area: 'a', cefr: 'B1-B2' }, { area: 'a', cefr: null },
        ])

        expect(row.perBand).toMatchObject({ A1: 0, A2: 1, B1: 1, B2: 2, C1: 0 })
        expect(row.untagged).toBe(1)
        expect(row.holes).toEqual([])
        expect(row.lowest).toBe('A2')
        expect(row.highest).toBe('B2')
    })

    it('reports a hole between populated bands, not at the edges', () => {
        const [row] = cefrCoverage([{ area: 'a', cefr: 'A2' }, { area: 'a', cefr: 'B2' }])

        expect(row.holes).toEqual(['B1'])
    })
})

describe('topicCoverage', () => {
    it('flags a topic with only choose-from-options items', () => {
        expect(topicCoverage(topic({ exercises: [exercise(true), exercise(true)] })).issues).toContain('recognition-only')
        expect(topicCoverage(topic({ exercises: [exercise(true), exercise(false)] })).issues).not.toContain('recognition-only')
    })

    it('flags a topic without exercises as such, not as recognition-only', () => {
        const { issues } = topicCoverage(topic())

        expect(issues).toContain('no-exercises')
        expect(issues).not.toContain('recognition-only')
    })

    it('counts audio and listening skill, and speaking from a task or role-play', () => {
        const covered = topicCoverage(topic({ exercises: [exercise(false, { audio: true }), exercise(false, { skill: 'listening' })], hasRoleplay: true }))

        expect(covered.listening).toBe(2)
        expect(covered.issues).not.toContain('no-listening')
        expect(covered.issues).not.toContain('no-speaking')
    })

    it('classifies exercises by what the learner does: recognise, recall a word, write a sentence', () => {
        const covered = topicCoverage(topic({ exercises: [exercise(true), { ...exercise(false), type: 'sentence-ordering' }, exercise(false), { ...exercise(false), type: 'dictation' }, { ...exercise(false), type: 'translation' }, { ...exercise(false), type: 'short-answer' }] }))

        expect([covered.recognition, covered.recall, covered.sentence, covered.typed]).toEqual([2, 2, 2, 4])
    })

    it('flags a topic with word-level typing but no sentence-level practice', () => {
        expect(topicCoverage(topic({ exercises: [exercise(true), exercise(false)] })).issues).toContain('no-sentence-practice')
        expect(topicCoverage(topic({ exercises: [exercise(true), { ...exercise(false), type: 'translation' }] })).issues).not.toContain('no-sentence-practice')
    })

    describe('objective links', () => {
        const linked = (objectiveId?: string, over = {}) => exercise(false, { objectiveId, ...over })

        it('an objective no exercise points at is unassessed', () => {
            const covered = topicCoverage(topic({ objectives: [{ id: 'a' }, { id: 'b' }], exercises: [linked('a')] }))

            expect(covered.issues).toContain('objective-unassessed')
            expect(covered.objectives.map(objective => objective.exercises)).toEqual([1, 0])
        })

        it('an objective assessed only by recognition is reported separately', () => {
            const covered = topicCoverage(topic({ objectives: [{ id: 'a' }], exercises: [exercise(true, { objectiveId: 'a' })] }))

            expect(covered.issues).toContain('objective-recognition-only')
            expect(covered.issues).not.toContain('objective-unassessed')
        })

        it('every exercise linked and every objective typed → no objective issues', () => {
            const covered = topicCoverage(topic({ objectives: [{ id: 'a' }], exercises: [linked('a'), exercise(true, { objectiveId: 'a' })] }))

            expect(covered.issues.filter(issue => issue.startsWith('objective') || issue === 'exercise-without-objective')).toEqual([])
        })

        it('an exercise without an objectiveId is flagged', () => {
            expect(topicCoverage(topic({ objectives: [{ id: 'a' }], exercises: [linked('a'), linked(undefined)] })).issues).toContain('exercise-without-objective')
        })
    })
})

const course = (words: VocabCourseInput['words']): VocabCourseInput => ({ id: 'c', label: 'C', words })
const word = (name: string, examples: string[], miniContext = ''): VocabCourseInput['words'][number] => ({ word: name, examples, miniContext, hasUsage: false, hasMistakes: false })

describe('repetition', () => {
    it('detects a course whose sentences differ only by the headword', () => {
        const words = Array.from({ length: 20 }, (_, i) => word(`w${i}`, [`The team had to w${i} its plan.`], `Please w${i} the item. It matters.`))
        const row = repetition(course(words))

        expect(row.repeatedExampleShare).toBe(1)
        expect(row.repeatedContextShare).toBe(1)
        expect(row.templatedExamples).toBe(true)
        expect(row.templatedContexts).toBe(true)
    })

    it('does not flag varied sentences', () => {
        const openers = ['Yesterday', 'Nobody', 'Surprisingly', 'Every', 'Although', 'Maria', 'Quickly', 'During', 'Without', 'Between']
        const words = Array.from({ length: 20 }, (_, i) => word(`w${i}`, [`${openers[i % 10]} ${'m'.repeat(i + 1)} said w${i} twice in story ${'x'.repeat(i + 1)}.`], `Context ${'y'.repeat(i + 1)} for w${i}.`))
        const row = repetition(course(words))

        expect(row.repeatedExampleShare).toBe(0)
        expect(row.templatedExamples).toBe(false)
        expect(row.templatedContexts).toBe(false)
    })

    it('does not treat a few repeats in a large course as boilerplate', () => {
        const words = Array.from({ length: 200 }, (_, i) => word(`w${i}`, i < 4 ? ['Same sentence for w.'.replace('w', `w${i}`)] : [`Distinct sentence ${'z'.repeat(i)} ${i}.`]))

        expect(repetition(course(words)).repeatedExampleShare).toBe(0)
    })

    it('counts usage and mistake notes only where present', () => {
        const row = repetition(course([{ ...word('a', ['A.']), hasUsage: true }, word('b', ['B.'])]))

        expect(row.withUsageNote).toBe(1)
        expect(row.withMistakeNote).toBe(0)
    })
})

describe('reachOf', () => {
    it('buckets the affected share', () => {
        expect(reachOf(1, 10)).toBe(1)
        expect(reachOf(3, 10)).toBe(2)
        expect(reachOf(6, 10)).toBe(3)
        expect(reachOf(0, 0)).toBe(1)
    })
})

describe('analyseContent', () => {
    const input = (over: Partial<GapInput> = {}): GapInput => ({ topics: [], vocab: [], levelled: [], patterns: [], expressions: [], ...over })

    it('returns nothing to fix for an empty inventory', () => {
        expect(analyseContent(input()).findings).toEqual([])
    })

    it('ranks an evidence-blocking gap above a polish gap that touches more units', () => {
        const report = analyseContent(input({
            topics: [topic({ id: 'g1', exercises: [exercise(true)] })],
            vocab: [course(Array.from({ length: 50 }, (_, i) => word(`w${i}`, [`Unique ${'q'.repeat(i + 1)}.`])))],
        }))
        const ids = report.findings.map(finding => finding.id)

        expect(ids.indexOf('grammar-recognition-only')).toBeLessThan(ids.indexOf('single-example'))
        expect(report.findings.find(finding => finding.id === 'grammar-recognition-only')?.impact).toBe(3)
    })

    it('reports recognition-only listening and reading topics too', () => {
        const report = analyseContent(input({ topics: [topic({ id: 'listening/x', area: 'listening', exercises: [exercise(true)] }), topic({ id: 'reading/y', area: 'reading', exercises: [exercise(true)] })] }))

        expect(report.findings.map(finding => finding.id)).toEqual(expect.arrayContaining(['listening-recognition-only', 'reading-recognition-only']))
    })

    it('sorts findings by priority, descending', () => {
        const priorities = analyseContent(gapInputFromContent(loadRepoContent() as RepoContent)).findings.map(finding => finding.priority)

        expect(priorities).toEqual([...priorities].sort((a, b) => b - a))
    })
})

describe('shipped content', () => {
    const report = analyseContent(gapInputFromContent(loadRepoContent() as RepoContent))

    it('is fully loaded', () => {
        expect(report.repetition.reduce((sum, row) => sum + row.words, 0)).toBe(6858)
        expect(report.topics.length).toBeGreaterThan(20)
        expect(report.anchors.length).toBeGreaterThanOrEqual(12)
    })

    it('every finding carries evidence, a reason and an action', () => {
        for (const finding of report.findings) {
            expect(finding.evidence.length).toBeGreaterThan(0)
            expect(finding.impactWhy.length).toBeGreaterThan(0)
            expect(finding.action.length).toBeGreaterThan(0)
            expect(finding.affected).toBeLessThanOrEqual(finding.of)
        }
    })

    it('finds the known templated courses and not the Oxford ones', () => {
        const flagged = report.repetition.filter(row => row.templatedContexts).map(row => row.course)

        expect(flagged).toEqual(expect.arrayContaining(['hard', 'hard-v2', '504']))
        expect(flagged.some(id => id.startsWith('oxford'))).toBe(false)
    })
})


describe('coverage report and objective index (shipped content)', () => {
    const content = loadRepoContent() as RepoContent
    const report = coverageReport(content)
    const index = objectiveIndex(content)

    it('counts what the repository really contains', () => {
        expect(report.inventory.vocabularyWords).toBe(6858)
        expect(report.inventory.realLifeScenarios).toBeGreaterThanOrEqual(30)
        expect(report.inventory.transferPatterns).toBeGreaterThanOrEqual(12)
        expect(report.areas.map(area => area.area)).toEqual(['grammar', 'listening', 'reading', 'real-life'])
        expect(report.areas.reduce((sum, area) => sum + area.exercises, 0)).toBe(report.inventory.exercises)
    })

    it('every objective is assessed by at least one exercise, and every exercise is linked to an objective', () => {
        expect(report.findings.map(finding => finding.id)).not.toContain('objectives-unassessed')
        expect(report.findings.map(finding => finding.id)).not.toContain('exercises-unlinked')
    })

    it('every topic has a typed sentence-level exercise', () => {
        expect(report.topics.filter(topic => topic.issues.includes('no-sentence-practice')).map(topic => topic.id)).toEqual([])
    })

    it('listening and speaking exist at every level from A1 to B2', () => {
        for (const row of report.listeningSpeaking.filter(item => ['A1', 'A2', 'B1', 'B2'].includes(item.band))) {
            expect(row.listeningActivities, row.band).toBeGreaterThan(0)
            expect(row.speakingTopics + row.realLifeSpeakingTasks, row.band).toBeGreaterThan(0)
        }
    })

    it('the objective index lists every objective once, with the expressions its exercises evidence', () => {
        expect(index.length).toBe(report.inventory.objectives)
        expect(new Set(index.map(entry => `${entry.topic}#${entry.id}`)).size).toBe(index.length)
        expect(index.filter(entry => entry.area === 'real-life').every(entry => entry.targets.length > 0)).toBe(true)
        expect(index.every(entry => entry.exercises.recognition + entry.exercises.recall + entry.exercises.sentence > 0)).toBe(true)
    })
})
