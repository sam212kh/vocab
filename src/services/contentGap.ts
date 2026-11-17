/**
 * Content gap analysis (Phase 9.7). Pure and self-contained (no runtime imports) so the
 * report script can load it directly. Every number comes from the shipped content files;
 * nothing is inferred about CEFR beyond the labels authors wrote, and ranges are never split.
 */

export const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Band = (typeof BANDS)[number]

/** 'A2-B1' → ['A2','B1'] (every band the item spans). Unknown / missing label → []. */
export function bandsOf(label: string | null | undefined): Band[] {
    if (!label) return []

    const parts = label.split('-').map(part => part.trim().toUpperCase())
    const indexes = parts.map(part => BANDS.indexOf(part as Band))

    if (indexes.some(index => index < 0)) return []

    const [from, to] = [Math.min(...indexes), Math.max(...indexes)]

    return BANDS.slice(from, to + 1)
}

/* ---------- inputs (normalised by the loader) ---------- */

export interface ExerciseInput {
    type: string
    skill: string
    cefrLevel?: string
    /** Learner picks from options (true) or types / orders a response (false). */
    hasOptions: boolean
    audio: boolean
    /** Learning objective this exercise assesses (Phase 10.5). */
    objectiveId?: string
    /** Words in the spoken text of a dictation: a dictation of a whole sentence is typed sentence-level work. */
    audioWords?: number
    /** Reading comprehension kind, when authored. */
    kind?: string
}

export type TopicArea = 'grammar' | 'listening' | 'reading' | 'real-life'

export interface TopicInput {
    id: string
    area: TopicArea
    exercises: ExerciseInput[]
    /** Authored learning objectives (explicit or derived ids). */
    objectives: { id: string }[]
    /** Author-assigned CEFR label of the topic. */
    cefr?: string
    /** Teaching examples / expressions the topic presents. */
    examples: number
    hasSpeakingTask: boolean
    hasRoleplay: boolean
}

export interface VocabWordInput {
    word: string
    examples: string[]
    miniContext: string
    hasUsage: boolean
    hasMistakes: boolean
}

export interface VocabCourseInput {
    id: string
    label: string
    words: VocabWordInput[]
}

export interface LevelledItem {
    area: string
    cefr: string | null
}

export interface TransferPatternInput {
    id: string
    matches: string[]
    contextCount: number
    levels: number[]
}

/* ---------- 1. CEFR coverage ---------- */

export interface CoverageRow {
    area: string
    total: number
    perBand: Record<Band, number>
    untagged: number
    /** Bands inside the populated span that have nothing (a hole, not an edge). */
    holes: Band[]
    lowest: Band | null
    highest: Band | null
}

export function cefrCoverage(items: LevelledItem[]): CoverageRow[] {
    const areas = [...new Set(items.map(item => item.area))]

    return areas.map(area => {
        const mine = items.filter(item => item.area === area)
        const perBand = Object.fromEntries(BANDS.map(band => [band, 0])) as Record<Band, number>
        let untagged = 0

        for (const item of mine) {
            const bands = bandsOf(item.cefr)

            if (!bands.length) untagged++
            for (const band of bands) perBand[band]++
        }

        const populated = BANDS.filter(band => perBand[band] > 0)
        const lowest = populated[0] ?? null
        const highest = populated[populated.length - 1] ?? null
        const holes =
            lowest && highest ? BANDS.slice(BANDS.indexOf(lowest), BANDS.indexOf(highest) + 1).filter(band => perBand[band] === 0) : []

        return { area, total: mine.length, perBand, untagged, holes, lowest, highest }
    })
}

/* ---------- 2. Activity coverage per topic ---------- */

export interface ObjectiveCoverage {
    id: string
    exercises: number
    recognition: number
    recall: number
    sentence: number
}

export interface TopicCoverage {
    id: string
    area: TopicArea
    exercises: number
    /** Choose-from-options, matching and ordering items: the learner recognises or arranges given words. */
    recognition: number
    /** Word / phrase typed from a cue (fill in the blank, dictation). */
    recall: number
    /** Sentence-level typed answers (translation, short answer, correction, writing response). */
    sentence: number
    /** recall + sentence */
    typed: number
    listening: number
    speaking: boolean
    roleplay: boolean
    objectives: ObjectiveCoverage[]
    issues: TopicIssue[]
}

export type TopicIssue =
    | 'recognition-only'
    | 'no-sentence-practice'
    | 'no-listening'
    | 'no-speaking'
    | 'no-exercises'
    | 'objective-unassessed'
    | 'objective-recognition-only'
    | 'exercise-without-objective'

const RECOGNITION_TYPES = ['multiple-choice', 'listening-comprehension', 'reading-comprehension', 'matching', 'sentence-ordering']
const SENTENCE_TYPES = ['translation', 'short-answer', 'grammar-correction', 'writing-response']
/** A dictation of at least this many words is typing a whole sentence, not a word or phrase. */
export const SENTENCE_DICTATION_WORDS = 4

export type ExerciseMode = 'recognition' | 'recall' | 'sentence'

export function modeOf(exercise: { type: string; audioWords?: number }): ExerciseMode {
    if (RECOGNITION_TYPES.includes(exercise.type)) return 'recognition'
    if (SENTENCE_TYPES.includes(exercise.type)) return 'sentence'
    if (exercise.type === 'dictation' && (exercise.audioWords ?? 0) >= SENTENCE_DICTATION_WORDS) return 'sentence'

    return 'recall'
}

export function topicCoverage(topic: TopicInput): TopicCoverage {
    const count = (mode: ExerciseMode, list = topic.exercises) => list.filter(exercise => modeOf(exercise) === mode).length
    const recognition = count('recognition')
    const recall = count('recall')
    const sentence = count('sentence')
    const typed = recall + sentence
    const listening = topic.exercises.filter(exercise => exercise.audio || exercise.skill === 'listening').length
    const issues: TopicIssue[] = []

    if (!topic.exercises.length) issues.push('no-exercises')
    else {
        if (typed === 0) issues.push('recognition-only')
        if (sentence === 0) issues.push('no-sentence-practice')
    }

    if (topic.area !== 'listening' && listening === 0) issues.push('no-listening')
    if (!topic.hasSpeakingTask && !topic.hasRoleplay) issues.push('no-speaking')

    const objectives = topic.objectives.map(objective => {
        const mine = topic.exercises.filter(exercise => exercise.objectiveId === objective.id)

        return { id: objective.id, exercises: mine.length, recognition: count('recognition', mine), recall: count('recall', mine), sentence: count('sentence', mine) }
    })

    if (objectives.some(objective => objective.exercises === 0)) issues.push('objective-unassessed')
    if (objectives.some(objective => objective.exercises > 0 && objective.recall + objective.sentence === 0)) issues.push('objective-recognition-only')
    if (topic.exercises.some(exercise => !exercise.objectiveId)) issues.push('exercise-without-objective')

    return {
        id: topic.id,
        area: topic.area,
        exercises: topic.exercises.length,
        recognition,
        recall,
        sentence,
        typed,
        listening,
        speaking: topic.hasSpeakingTask,
        roleplay: topic.hasRoleplay,
        objectives,
        issues,
    }
}

/* ---------- 3. Repetition / templating ---------- */

const words = (text: string) => text.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean)

export const TEMPLATE_RULES = {
    /** An example "opens with a common frame" when its first N words recur at least as often as the boilerplate threshold below. */
    openingWords: 4,
    /** A sentence is course-wide boilerplate when, with the headword masked, it appears for at least this many words AND this share of the course. */
    repeatedMinWords: 5,
    repeatedMinShare: 0.05,
    /** A course is flagged when at least this share of its sentences are boilerplate. */
    flagShare: 0.5,
} as const

export interface RepetitionRow {
    course: string
    label: string
    words: number
    examplesPerWord: number
    /** Share of examples whose first words are a frame reused across many words. */
    commonOpeningShare: number
    /** Share of example sentences that are course-wide boilerplate once the headword is masked. */
    repeatedExampleShare: number
    /** Share of mini-context sentences that are course-wide boilerplate once the headword is masked. */
    repeatedContextShare: number
    distinctMiniContexts: number
    withUsageNote: number
    withMistakeNote: number
    templatedExamples: boolean
    templatedContexts: boolean
}

function maskHeadword(text: string, word: string) {
    return text.toLowerCase().replace(new RegExp(word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '{w}').trim()
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).map(part => part.trim()).filter(Boolean)

/** Share of sentences (masked by headword) that recur for enough different words to be boilerplate. */
function boilerplateShare(perWord: { word: string; sentences: string[] }[], totalWords: number) {
    const wordsPerSentence = new Map<string, Set<number>>()

    perWord.forEach((entry, index) => {
        for (const sentence of entry.sentences) {
            const key = maskHeadword(sentence, entry.word)

            if (!wordsPerSentence.has(key)) wordsPerSentence.set(key, new Set())
            wordsPerSentence.get(key)!.add(index)
        }
    })

    const threshold = Math.max(TEMPLATE_RULES.repeatedMinWords, Math.ceil(totalWords * TEMPLATE_RULES.repeatedMinShare))
    let total = 0
    let repeated = 0

    for (const entry of perWord)
        for (const sentence of entry.sentences) {
            total++
            if ((wordsPerSentence.get(maskHeadword(sentence, entry.word))?.size ?? 0) >= threshold) repeated++
        }

    return total ? repeated / total : 0
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function repetition(course: VocabCourseInput): RepetitionRow {
    const openings = new Map<string, number>()
    let exampleCount = 0

    for (const word of course.words)
        for (const example of word.examples) {
            exampleCount++
            const opening = words(example).slice(0, TEMPLATE_RULES.openingWords).join(' ')

            openings.set(opening, (openings.get(opening) ?? 0) + 1)
        }

    const threshold = Math.max(TEMPLATE_RULES.repeatedMinWords, Math.ceil(course.words.length * TEMPLATE_RULES.repeatedMinShare))
    const common = [...openings.values()].filter(count => count >= threshold).reduce((sum, count) => sum + count, 0)
    const commonShare = exampleCount ? common / exampleCount : 0

    const repeatedExamples = boilerplateShare(course.words.map(word => ({ word: word.word, sentences: word.examples })), course.words.length)
    const repeatedContexts = boilerplateShare(
        course.words.filter(word => word.miniContext).map(word => ({ word: word.word, sentences: sentencesOf(word.miniContext) })),
        course.words.length
    )

    return {
        course: course.id,
        label: course.label,
        words: course.words.length,
        examplesPerWord: course.words.length ? Math.round((exampleCount / course.words.length) * 10) / 10 : 0,
        commonOpeningShare: round2(commonShare),
        repeatedExampleShare: round2(repeatedExamples),
        repeatedContextShare: round2(repeatedContexts),
        distinctMiniContexts: new Set(course.words.map(word => maskHeadword(word.miniContext, word.word))).size,
        withUsageNote: course.words.filter(word => word.hasUsage).length,
        withMistakeNote: course.words.filter(word => word.hasMistakes).length,
        templatedExamples: Math.max(repeatedExamples, commonShare) >= TEMPLATE_RULES.flagShare,
        templatedContexts: repeatedContexts >= TEMPLATE_RULES.flagShare,
    }
}

/* ---------- 4. Transfer anchors ---------- */

export interface AnchorRow {
    pattern: string
    /** Taught expressions (from topic content) that match this pattern. */
    anchors: number
    contexts: number
    levels: number[]
}

export function transferAnchors(patterns: TransferPatternInput[], expressions: string[]): AnchorRow[] {
    return patterns.map(pattern => ({
        pattern: pattern.id,
        anchors: expressions.filter(text => pattern.matches.some(source => new RegExp(source, 'i').test(text))).length,
        contexts: pattern.contextCount,
        levels: [...new Set(pattern.levels)].sort(),
    }))
}

/* ---------- 5. Findings and priority ---------- */

export type Impact = 1 | 2 | 3

export interface Finding {
    id: string
    title: string
    evidence: string
    /** Learner-facing units affected, and the total units in that area. */
    affected: number
    of: number
    impact: Impact
    impactWhy: string
    reach: 1 | 2 | 3
    priority: number
    action: string
}

/**
 * priority = impact × 3 + reach, so impact always outranks reach (a 3-impact gap touching few units
 * still ranks above a 1-impact gap touching everything).
 *  impact 3: removes a rung of the evidence ladder (no way to show recall, production or transfer).
 *  impact 2: weakens evidence quality (learner can pass by recognising a template or option).
 *  impact 1: coverage polish that does not block evidence.
 *  reach 1/2/3: affected share of the area's units below 25% / below 60% / at least 60%.
 */
export function reachOf(affected: number, total: number): 1 | 2 | 3 {
    if (!total) return 1

    const share = affected / total

    return share >= 0.6 ? 3 : share >= 0.25 ? 2 : 1
}

function finding(partial: Omit<Finding, 'reach' | 'priority'>): Finding {
    const reach = reachOf(partial.affected, partial.of)

    return { ...partial, reach, priority: partial.impact * 3 + reach }
}

export interface GapInput {
    topics: TopicInput[]
    vocab: VocabCourseInput[]
    levelled: LevelledItem[]
    patterns: TransferPatternInput[]
    expressions: string[]
}

export interface GapReport {
    coverage: CoverageRow[]
    topics: TopicCoverage[]
    repetition: RepetitionRow[]
    anchors: AnchorRow[]
    findings: Finding[]
}

export function analyseContent(input: GapInput): GapReport {
    const coverage = cefrCoverage(input.levelled)
    const topics = input.topics.map(topicCoverage)
    const repeated = input.vocab.map(repetition)
    const anchors = transferAnchors(input.patterns, input.expressions)
    const findings: Finding[] = []

    const totalWords = input.vocab.reduce((sum, course) => sum + course.words.length, 0)

    const templated = repeated.filter(row => row.templatedContexts)

    if (templated.length)
        findings.push(
            finding({
                id: 'templated-mini-context',
                title: 'Mini-contexts are mostly boilerplate sentences',
                evidence: templated.map(row => `${row.label}: ${Math.round(row.repeatedContextShare * 100)}% of context sentences are boilerplate (${row.distinctMiniContexts} distinct contexts)`).join('; '),
                affected: templated.reduce((sum, row) => sum + row.words, 0),
                of: totalWords,
                impact: 2,
                impactWhy: 'The context carries no information about the word, so it cannot support contextual-usage evidence.',
                action: 'Author varied, real contexts for these words before adding new vocabulary.',
            })
        )

    const openers = repeated.filter(row => row.templatedExamples)

    if (openers.length)
        findings.push(
            finding({
                id: 'repetitive-examples',
                title: 'Examples reuse the same sentences or frames',
                evidence: openers.map(row => `${row.label}: ${Math.round(Math.max(row.repeatedExampleShare, row.commonOpeningShare) * 100)}% of examples are boilerplate or share a common opening`).join('; '),
                affected: openers.reduce((sum, row) => sum + row.words, 0),
                of: totalWords,
                impact: 2,
                impactWhy: 'Learners can answer from the frame, so a correct answer shows less than it appears to.',
                action: 'Replace templated examples with varied ones, starting with the most-missed words.',
            })
        )

    const thin = repeated.filter(row => row.examplesPerWord < 2)

    if (thin.length)
        findings.push(
            finding({
                id: 'single-example',
                title: 'Only one example per word',
                evidence: thin.map(row => `${row.label}: ${row.examplesPerWord} per word`).join('; '),
                affected: thin.reduce((sum, row) => sum + row.words, 0),
                of: totalWords,
                impact: 1,
                impactWhy: 'One example cannot show a word in more than one context.',
                action: 'Add a second genuine example to the most frequent words; do not bulk-generate.',
            })
        )

    const noNotes = repeated.filter(row => row.withUsageNote === 0 && row.withMistakeNote === 0)

    if (noNotes.length)
        findings.push(
            finding({
                id: 'no-usage-or-mistake-notes',
                title: 'No usage or common-mistake notes',
                evidence: noNotes.map(row => `${row.label}: 0 of ${row.words}`).join('; '),
                affected: noNotes.reduce((sum, row) => sum + row.words, 0),
                of: totalWords,
                impact: 1,
                impactWhy: 'Confusion patterns cannot be explained when the content has nothing to point to.',
                action: 'Add notes for high-confusion words first, ranked by real SRS misses.',
            })
        )

    const countIssue = (issue: TopicIssue, area?: TopicArea) => topics.filter(topic => topic.issues.includes(issue) && (!area || topic.area === area))
    const inArea = (area: TopicArea) => topics.filter(topic => topic.area === area).length

    const AREA_LABEL: Record<TopicArea, string> = { grammar: 'Grammar', listening: 'Listening', reading: 'Reading', 'real-life': 'Real-Life' }

    for (const area of ['grammar', 'listening', 'reading', 'real-life'] as const) {
        const hit = countIssue('recognition-only', area)

        if (hit.length)
            findings.push(
                finding({
                    id: `${area}-recognition-only`,
                    title: `${AREA_LABEL[area]} topics with only choose-from-options exercises`,
                    evidence: hit.map(topic => topic.id).join(', '),
                    affected: hit.length,
                    of: inArea(area),
                    impact: 3,
                    impactWhy: 'Without a typed or ordered response the topic cannot produce recall or production evidence.',
                    action: 'Add typed-response exercises to these topics.',
                })
            )
    }

    const noSpeaking = topics.filter(topic => topic.issues.includes('no-speaking') && (topic.area === 'listening' || topic.area === 'reading'))

    if (noSpeaking.length)
        findings.push(
            finding({
                id: 'no-speaking-link',
                title: 'Listening and reading topics have no speaking step',
                evidence: `${noSpeaking.length} of ${topics.filter(topic => topic.area === 'listening' || topic.area === 'reading').length} topics (the Speaking and Real-Life modules cover speaking separately)`,
                affected: noSpeaking.length,
                of: topics.filter(topic => topic.area === 'listening' || topic.area === 'reading').length,
                impact: 2,
                impactWhy: 'Spoken use of the target language cannot be observed from these topics.',
                action: 'Add a short speaking task per topic (the speaking engine already exists).',
            })
        )

    const noListening = topics.filter(topic => topic.issues.includes('no-listening') && topic.area === 'grammar')

    if (noListening.length)
        findings.push(
            finding({
                id: 'grammar-no-listening',
                title: 'Grammar topics have no listening exercise',
                evidence: `${noListening.length} of ${inArea('grammar')} grammar topics`,
                affected: noListening.length,
                of: inArea('grammar'),
                impact: 1,
                impactWhy: 'Grammar is only ever met in writing; audio adds a second modality.',
                action: 'Add dictation or listening items using the existing TTS.',
            })
        )

    const objectiveRows = topics.flatMap(topic => topic.objectives.map(objective => ({ topic: topic.id, ...objective })))
    const unassessed = objectiveRows.filter(row => row.exercises === 0)
    const recognitionOnly = objectiveRows.filter(row => row.exercises > 0 && row.recall + row.sentence === 0)
    const unlinkedExercises = topics.reduce((sum, topic) => sum + (topic.issues.includes('exercise-without-objective') ? 1 : 0), 0)

    if (unassessed.length)
        findings.push(
            finding({
                id: 'objectives-unassessed',
                title: 'Learning objectives with no exercise',
                evidence: `${unassessed.length} of ${objectiveRows.length}: ${unassessed.slice(0, 6).map(row => `${row.topic}#${row.id}`).join(', ')}${unassessed.length > 6 ? ', …' : ''}`,
                affected: unassessed.length,
                of: objectiveRows.length,
                impact: 3,
                impactWhy: 'An objective nothing assesses can never show evidence, so mastery of it cannot be reported.',
                action: 'Add at least one exercise for each of these objectives, preferably typed.',
            })
        )

    if (recognitionOnly.length)
        findings.push(
            finding({
                id: 'objectives-recognition-only',
                title: 'Learning objectives assessed only by recognition',
                evidence: `${recognitionOnly.length} of ${objectiveRows.length}: ${recognitionOnly.slice(0, 6).map(row => `${row.topic}#${row.id}`).join(', ')}${recognitionOnly.length > 6 ? ', …' : ''}`,
                affected: recognitionOnly.length,
                of: objectiveRows.length,
                impact: 3,
                impactWhy: 'Choosing an option never shows the learner can recall or use the language.',
                action: 'Add a typed exercise (fill in the blank, translation or short answer) for each of these objectives.',
            })
        )

    if (unlinkedExercises)
        findings.push(
            finding({
                id: 'exercises-unlinked',
                title: 'Exercises not linked to a learning objective',
                evidence: `${unlinkedExercises} topics contain exercises without an objectiveId`,
                affected: unlinkedExercises,
                of: topics.length,
                impact: 2,
                impactWhy: 'Evidence from an unlinked exercise cannot be traced to the goal it supports.',
                action: 'Set objectiveId on every exercise.',
            })
        )

    const noSentence = topics.filter(topic => topic.issues.includes('no-sentence-practice') && topic.exercises > 0)

    if (noSentence.length)
        findings.push(
            finding({
                id: 'no-sentence-practice',
                title: 'Topics with no sentence-level typed exercise',
                evidence: noSentence.map(topic => topic.id).join(', '),
                affected: noSentence.length,
                of: topics.length,
                impact: 3,
                impactWhy: 'Without writing a whole sentence, the learner cannot show production, only recognition or single-word recall.',
                action: 'Add a translation, short-answer or correction exercise to each of these topics.',
            })
        )

    const reading = input.topics.filter(topic => topic.area === 'reading')
    const kinds = new Set(reading.flatMap(topic => topic.exercises.map(exercise => exercise.kind).filter(Boolean)))

    if (reading.length && kinds.size < 5)
        findings.push(
            finding({
                id: 'reading-kinds',
                title: 'Reading comprehension kinds are limited',
                evidence: `${kinds.size} kinds in use: ${[...kinds].join(', ')}`,
                affected: reading.length,
                of: reading.length,
                impact: 1,
                impactWhy: 'Few kinds of question means reading skill is judged on a narrow set of tasks.',
                action: 'Add sequencing, reference and tone questions when new texts are written.',
            })
        )

    const thinAnchors = anchors.filter(row => row.anchors < 2)

    if (thinAnchors.length)
        findings.push(
            finding({
                id: 'transfer-anchors',
                title: 'Transfer patterns with a single taught expression to build on',
                evidence: thinAnchors.map(row => `${row.pattern}: ${row.anchors} anchors`).join('; '),
                affected: thinAnchors.length,
                of: anchors.length,
                impact: 3,
                impactWhy: 'Transfer tasks only start after an expression is recalled; few anchors means few learners ever reach them.',
                action: 'Teach more expressions that fit these patterns, then add patterns.',
            })
        )

    if (anchors.length && anchors.length < 10)
        findings.push(
            finding({
                id: 'transfer-breadth',
                title: 'Only a few transfer patterns exist',
                evidence: `${anchors.length} patterns, ${anchors.reduce((sum, row) => sum + row.contexts, 0)} situations in total`,
                affected: 1,
                of: 1,
                impact: 2,
                impactWhy: 'Learners meet the same situations repeatedly, so transfer to genuinely new ones is limited.',
                action: 'Author further patterns (e.g. past events, plans, opinions) with their own situations.',
            })
        )

    for (const row of coverage) {
        const missingBelow = row.lowest && BANDS.indexOf(row.lowest) > 1
        const where = `${row.area}: ${row.lowest ?? 'none'}–${row.highest ?? 'none'}`

        if (row.holes.length)
            findings.push(
                finding({
                    id: `cefr-hole-${row.area}`,
                    title: `No ${row.area} content at ${row.holes.join(', ')}`,
                    evidence: where,
                    affected: row.holes.length,
                    of: BANDS.indexOf(row.highest!) - BANDS.indexOf(row.lowest!) + 1,
                    impact: 1,
                    impactWhy: 'A gap inside the range leaves learners without a step between two levels.',
                    action: 'Add items at the missing band.',
                })
            )

        if (missingBelow)
            findings.push(
                finding({
                    id: `cefr-start-${row.area}`,
                    title: `${row.area} content starts at ${row.lowest}`,
                    evidence: where,
                    affected: 1,
                    of: 1,
                    impact: 1,
                    impactWhy: 'Beginners have nothing tagged at their level in this skill.',
                    action: 'Add entry-level items if beginners are a target audience.',
                })
            )
    }

    findings.sort((a, b) => b.priority - a.priority || b.affected - a.affected || a.id.localeCompare(b.id))

    return { coverage, topics, repetition: repeated, anchors, findings }
}
