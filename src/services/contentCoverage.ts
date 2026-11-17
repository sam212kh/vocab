/**
 * Content coverage (Phase 10.8): turns the parsed repository content into the inputs and the
 * report the developer-facing coverage script prints. Every number is counted from the files.
 * Self-contained apart from the two sibling services (explicit .ts extensions so Node can load it).
 */
import { analyseContent, cefrCoverage, modeOf, topicCoverage, BANDS } from './contentGap.ts'
import { AREAS, bandsOf, loadTopics, objectivesOf } from './contentValidation.ts'

import type { AnchorRow, CoverageRow, ExerciseInput, Finding, GapInput, LevelledItem, RepetitionRow, TopicCoverage, TopicInput, TransferPatternInput, VocabCourseInput } from './contentGap.ts'
import type { LoadedTopic, RepoContent } from './contentValidation.ts'
import type { ObjectiveIndexEntry } from '../types/objectives.ts'

type Obj = Record<string, unknown>

const isObj = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value)
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown) => (typeof value === 'string' ? value : '')

/* ---------- vocabulary courses ---------- */

const exampleText = (example: unknown): string => (typeof example === 'string' ? example : Array.isArray(example) ? text(example[0]) : isObj(example) ? text(example.english) : '')

export function vocabularyOf(content: RepoContent): VocabCourseInput[] {
    const manifest = content.json['manifest.json']
    const courses = isObj(manifest) ? arr(manifest.courses) : []
    const out: VocabCourseInput[] = []

    for (const course of courses) {
        if (!isObj(course)) continue

        const id = text(course.id)
        const words: VocabCourseInput['words'] = []

        for (const lesson of arr(course.lessons)) {
            if (!isObj(lesson)) continue

            const relative = text(lesson.file).replace(/^\.\//, '')
            const list = [content.json[relative], content.json[`${id}/${relative}`]].find(Array.isArray) as unknown[] | undefined

            for (const entry of list ?? []) {
                if (!isObj(entry)) continue

                words.push({
                    word: text(entry.word),
                    examples: arr(entry.examples).map(exampleText).filter(Boolean),
                    miniContext: text(entry.miniContext),
                    hasUsage: Boolean(entry.usage ?? entry.usageNote ?? entry.usageNotes),
                    hasMistakes: Boolean(entry.mistakes ?? entry.commonMistakes),
                })
            }
        }

        out.push({ id, label: text(course.title) || id, words })
    }

    return out
}

/* ---------- topics ---------- */

const exerciseInput = (raw: unknown): ExerciseInput => {
    const exercise = isObj(raw) ? raw : {}

    return {
        type: text(exercise.type),
        skill: text(exercise.skill),
        cefrLevel: text(exercise.cefrLevel) || undefined,
        hasOptions: Array.isArray(exercise.options) && exercise.options.length > 0,
        audio: text(exercise.audioText).length > 0,
        audioWords: text(exercise.audioText).split(/\s+/).filter(Boolean).length,
        objectiveId: text(exercise.objectiveId) || undefined,
        kind: text(exercise.comprehensionKind) || undefined,
    }
}

export function topicInputs(topics: LoadedTopic[]): TopicInput[] {
    return topics.map(topic => ({
        id: `${topic.area}/${topic.id}`,
        area: topic.area,
        cefr: text(topic.manifest.cefrLevel) || undefined,
        exercises: arr(topic.file?.exercises).map(exerciseInput),
        objectives: objectivesOf(topic.manifest).map(objective => ({ id: objective.id })),
        examples: arr(topic.file?.examples ?? topic.file?.expressions).length,
        hasSpeakingTask: Boolean(topic.file?.speakingTask),
        hasRoleplay: Boolean(topic.file?.roleplay),
    }))
}

export function gapInputFromContent(content: RepoContent): GapInput {
    const topics = loadTopics(content)
    const levelled: LevelledItem[] = []

    for (const topic of topics) for (const exercise of arr(topic.file?.exercises)) levelled.push({ area: `${topic.area} exercises`, cefr: exerciseInput(exercise).cefrLevel ?? null })

    for (const scenario of arr(isObj(content.json['conversation/scenarios.json']) ? (content.json['conversation/scenarios.json'] as Obj).scenarios : [])) levelled.push({ area: 'conversation scenarios', cefr: isObj(scenario) ? text(scenario.cefrLevel) || null : null })
    for (const topic of arr(isObj(content.json['speaking/manifest.json']) ? (content.json['speaking/manifest.json'] as Obj).topics : [])) levelled.push({ area: 'speaking topics', cefr: isObj(topic) ? text(topic.cefrLevel) || null : null })
    for (const prompt of arr(isObj(content.json['writing/manifest.json']) ? (content.json['writing/manifest.json'] as Obj).prompts : [])) levelled.push({ area: 'writing prompts', cefr: isObj(prompt) ? text(prompt.cefrLevel) || null : null })

    const expressions: string[] = []

    for (const topic of topics) if (topic.area === 'real-life') for (const expression of arr(topic.file?.expressions)) if (isObj(expression) && text(expression.english)) expressions.push(text(expression.english))

    const transfer = content.json['transfer/patterns.json']
    const patterns: TransferPatternInput[] = arr(isObj(transfer) ? transfer.patterns : []).filter(isObj).map(pattern => ({
        id: text(pattern.id),
        matches: arr(pattern.matches).map(text).filter(Boolean),
        contextCount: arr(pattern.contexts).length,
        levels: arr(pattern.contexts).filter(isObj).map(context => Number(context.level)),
    }))

    return { topics: topicInputs(topics), vocab: vocabularyOf(content), levelled, patterns, expressions }
}

/* ---------- the report ---------- */

export interface AreaTotals {
    area: string
    topics: number
    exercises: number
    recognition: number
    recall: number
    sentence: number
    byBand: Record<string, number>
}

export interface SpeakingListeningRow {
    band: string
    listeningActivities: number
    listeningExercises: number
    dictation: number
    speakingTopics: number
    speakingRepeatSteps: number
    speakingOpenSteps: number
    realLifeSpeakingTasks: number
    roleplays: number
    conversationScenarios: number
    writingPrompts: number
}

export interface InventoryCounts {
    vocabularyWords: number
    vocabularyCourses: number
    realLifeScenarios: number
    realLifeExpressions: number
    grammarTopics: number
    grammarExamples: number
    listeningActivities: number
    listeningLines: number
    readingPassages: number
    readingParagraphs: number
    speakingTopics: number
    speakingSteps: number
    writingPrompts: number
    conversationScenarios: number
    exercises: number
    objectives: number
    transferPatterns: number
    transferSituations: number
}

export interface PatternRow extends AnchorRow {
    cefr: string
    hasExplanation: boolean
    contextsWithFeedback: number
    averageReferences: number
}

export interface CoverageReport {
    inventory: InventoryCounts
    areas: AreaTotals[]
    topics: (TopicCoverage & { cefr: string })[]
    cefr: CoverageRow[]
    exerciseTypes: Record<string, number>
    repetition: RepetitionRow[]
    patterns: PatternRow[]
    listeningSpeaking: SpeakingListeningRow[]
    findings: Finding[]
}

const emptyBands = () => Object.fromEntries(BANDS.map(band => [band, 0])) as Record<string, number>

export function coverageReport(content: RepoContent): CoverageReport {
    const input = gapInputFromContent(content)
    const topics = loadTopics(content)
    const gap = analyseContent(input)
    const covered = input.topics.map(topic => ({ ...topicCoverage(topic), cefr: topic.cefr ?? '' }))

    const areas: AreaTotals[] = AREAS.map(({ area }) => {
        const mine = covered.filter(topic => topic.area === area)
        const byBand = emptyBands()

        for (const topic of mine) for (const band of bandsOf(topic.cefr)) byBand[band]++

        return {
            area,
            topics: mine.length,
            exercises: mine.reduce((sum, topic) => sum + topic.exercises, 0),
            recognition: mine.reduce((sum, topic) => sum + topic.recognition, 0),
            recall: mine.reduce((sum, topic) => sum + topic.recall, 0),
            sentence: mine.reduce((sum, topic) => sum + topic.sentence, 0),
            byBand,
        }
    })

    const exerciseTypes: Record<string, number> = {}

    for (const topic of input.topics) for (const exercise of topic.exercises) exerciseTypes[exercise.type] = (exerciseTypes[exercise.type] ?? 0) + 1

    const speaking = arr(isObj(content.json['speaking/manifest.json']) ? (content.json['speaking/manifest.json'] as Obj).topics : []).filter(isObj)
    const writing = arr(isObj(content.json['writing/manifest.json']) ? (content.json['writing/manifest.json'] as Obj).prompts : []).filter(isObj)
    const conversation = arr(isObj(content.json['conversation/scenarios.json']) ? (content.json['conversation/scenarios.json'] as Obj).scenarios : []).filter(isObj)
    const patternsRaw = arr(isObj(content.json['transfer/patterns.json']) ? (content.json['transfer/patterns.json'] as Obj).patterns : []).filter(isObj)

    const listeningSpeaking: SpeakingListeningRow[] = BANDS.slice(0, 5).map(band => {
        const inBand = (label: unknown) => bandsOf(label).includes(band)
        const listeningTopics = topics.filter(topic => topic.area === 'listening' && inBand(topic.manifest.cefrLevel))
        const realLife = topics.filter(topic => topic.area === 'real-life' && inBand(topic.manifest.cefrLevel))
        const steps = speaking.filter(topic => inBand(topic.cefrLevel)).flatMap(topic => arr(topic.steps).filter(isObj))

        return {
            band,
            listeningActivities: listeningTopics.length,
            listeningExercises: listeningTopics.reduce((sum, topic) => sum + arr(topic.file?.exercises).length, 0),
            dictation: listeningTopics.reduce((sum, topic) => sum + arr(topic.file?.exercises).filter(exercise => isObj(exercise) && exercise.type === 'dictation').length, 0),
            speakingTopics: speaking.filter(topic => inBand(topic.cefrLevel)).length,
            speakingRepeatSteps: steps.filter(step => step.kind === 'repeat').length,
            speakingOpenSteps: steps.filter(step => step.kind === 'open').length,
            realLifeSpeakingTasks: realLife.filter(topic => topic.file?.speakingTask).length,
            roleplays: realLife.filter(topic => topic.file?.roleplay).length,
            conversationScenarios: conversation.filter(scenario => inBand(scenario.cefrLevel)).length,
            writingPrompts: writing.filter(prompt => inBand(prompt.cefrLevel)).length,
        }
    })

    const patterns: PatternRow[] = gap.anchors.map(anchor => {
        const raw = patternsRaw.find(pattern => text(pattern.id) === anchor.pattern) ?? {}
        const contexts = arr(raw.contexts).filter(isObj)

        return {
            ...anchor,
            cefr: text(raw.cefrLevel),
            hasExplanation: Boolean(text(raw.explanation) && text(raw.explanationPersian) && text(raw.example)),
            contextsWithFeedback: contexts.filter(context => text(context.feedback) && text(context.feedbackPersian)).length,
            averageReferences: contexts.length ? Math.round((contexts.reduce((sum, context) => sum + arr(context.references).length, 0) / contexts.length) * 10) / 10 : 0,
        }
    })

    const realLifeTopics = topics.filter(topic => topic.area === 'real-life')

    const inventory: InventoryCounts = {
        vocabularyWords: input.vocab.reduce((sum, course) => sum + course.words.length, 0),
        vocabularyCourses: input.vocab.length,
        realLifeScenarios: realLifeTopics.length,
        realLifeExpressions: input.expressions.length,
        grammarTopics: topics.filter(topic => topic.area === 'grammar').length,
        grammarExamples: topics.filter(topic => topic.area === 'grammar').reduce((sum, topic) => sum + arr(topic.file?.examples).length, 0),
        listeningActivities: topics.filter(topic => topic.area === 'listening').length,
        listeningLines: topics.filter(topic => topic.area === 'listening').reduce((sum, topic) => sum + arr(topic.file?.lines).length, 0),
        readingPassages: topics.filter(topic => topic.area === 'reading').length,
        readingParagraphs: topics.filter(topic => topic.area === 'reading').reduce((sum, topic) => sum + arr(topic.file?.paragraphs).length, 0),
        speakingTopics: speaking.length,
        speakingSteps: speaking.reduce((sum, topic) => sum + arr(topic.steps).length, 0),
        writingPrompts: writing.length,
        conversationScenarios: conversation.length,
        exercises: input.topics.reduce((sum, topic) => sum + topic.exercises.length, 0),
        objectives: input.topics.reduce((sum, topic) => sum + topic.objectives.length, 0),
        transferPatterns: patterns.length,
        transferSituations: patterns.reduce((sum, pattern) => sum + pattern.contexts, 0),
    }

    return { inventory, areas, topics: covered, cefr: cefrCoverage(input.levelled), exerciseTypes, repetition: gap.repetition, patterns, listeningSpeaking, findings: gap.findings }
}

/* ---------- objective index (consumed by the app) ---------- */

/**
 * One entry per learning objective, with the expressions its exercises evidence. Generated by
 * `scripts/build-objective-index.mjs` into `public/data/objectives-index.json` so the app can
 * relate evidence to goals without loading every topic file.
 */
export function objectiveIndex(content: RepoContent): ObjectiveIndexEntry[] {
    const out: ObjectiveIndexEntry[] = []

    for (const topic of loadTopics(content)) {
        const exercises = arr(topic.file?.exercises).filter(isObj)

        for (const objective of objectivesOf(topic.manifest)) {
            const mine = exercises.filter(exercise => text(exercise.objectiveId) === objective.id)
            const targets = [...new Set(mine.flatMap(exercise => arr(exercise.targets).map(text).filter(Boolean)))]
            const count = (mode: 'recognition' | 'recall' | 'sentence') => mine.filter(exercise => modeOf({ type: text(exercise.type), audioWords: text(exercise.audioText).split(/\s+/).filter(Boolean).length }) === mode).length

            out.push({
                topic: `${topic.area}/${topic.id}`,
                area: topic.area,
                topicTitle: text(topic.manifest.title),
                ...(text(topic.manifest.titlePersian) ? { topicTitlePersian: text(topic.manifest.titlePersian) } : {}),
                cefr: text(topic.manifest.cefrLevel),
                id: objective.id,
                text: objective.text,
                ...(objective.textPersian ? { textPersian: objective.textPersian } : {}),
                targets,
                exercises: {
                    recognition: count('recognition'),
                    recall: count('recall'),
                    sentence: count('sentence'),
                },
            })
        }
    }

    return out
}
