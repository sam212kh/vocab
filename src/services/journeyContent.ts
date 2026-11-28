import { loadLesson, loadManifest } from './vocabulary'
import { loadGrammarManifest, loadGrammarTopic } from './grammarContent'
import { loadListeningActivity, loadListeningManifest } from './listeningContent'
import { loadRealLifeManifest, loadRealLifeScenario } from './realLifeContent'
import { loadCareerManifest, loadCareerSection } from './careerContent'
import { loadTransferPatterns } from './transferContent'
import { loadReadingManifest } from './readingContent'
import { loadSpeakingManifest } from './speakingContent'
import { loadWritingManifest } from './writingContent'
import { buildIntegratedUnits, type IntegratedManifestItem } from './integratedCurriculum'
import type { TransferPattern } from '../types/transfer'

import type { ContentSource } from './roadmap'
import type {
    ConstructionPrompt,
    PlannerInput,
    RetrievalItem,
    ThemeCandidate,
} from '../types/journey'
import type { Exercise } from '../types/exercise'
import type { WordProgress } from '../types/vocabulary'

/**
 * Builds the planner's input snapshot from existing content loaders.
 * EVERY source is optional: a failing/missing source degrades the plan
 * (the planner notes it) and never throws. Only PRACTICE content is read —
 * the server-side assessment banks are never touched.
 */

export interface ContentSnapshot {
    newWords: RetrievalItem[]
    grammarExercises: PlannerInput['grammarExercises']
    themes: ThemeCandidate[]
    dictationExercises: Exercise[]
    careerQuestions: PlannerInput['careerQuestions']
    availableSources: ContentSource[]
    /** Optional: transfer patterns (empty when the content is not deployed). */
    transferPatterns: TransferPattern[]
    integratedUnits: import('../types/integrated').IntegratedUnit[]
    /** word → retrieval item, used to turn due SRS records into prompts. */
    wordIndex: Map<string, RetrievalItem>
}

async function safe<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await loader()
    } catch {
        return fallback
    }
}

/** First phrase of the first example that carries a Persian translation, as a production prompt. */
function constructionFor(
    scenarioId: string,
    expressions: { english: string; persian: string }[],
    speakingInstruction: { instruction: string; instructionPersian: string },
    modelSentences: string[]
): ConstructionPrompt | null {
    if (!expressions.length) return null

    return {
        id: `${scenarioId}-construction`,
        promptEnglish: speakingInstruction.instruction,
        promptPersian: speakingInstruction.instructionPersian,
        targetExpressions: expressions.slice(0, 3).map(expression => expression.english),
        modelSentences,
    }
}

function emptySnapshot(): ContentSnapshot {
    return {
        newWords: [],
        grammarExercises: [],
        themes: [],
        dictationExercises: [],
        careerQuestions: [],
        availableSources: [],
        transferPatterns: [],
        integratedUnits: [],
        wordIndex: new Map(),
    }
}

/**
 * Loads only the content needed to produce a valid first activity. Optional
 * cross-skill sources are deliberately left for loadContentSnapshot(), which
 * can run after the learner has started.
 */
export async function loadEssentialContentSnapshot(
    studiedWordIds: Set<string>,
    dueProgress: WordProgress[]
): Promise<ContentSnapshot> {
    const snapshot = emptySnapshot()
    const vocabManifest = await safe(loadManifest, null)

    if (!vocabManifest?.courses.length) return snapshot

    snapshot.availableSources = ['vocabulary']

    const needed = new Map<string, { courseId: string; lessonId: string }>()

    for (const item of dueProgress) {
        if (item.courseId && item.lessonId) {
            needed.set(`${item.courseId}:${item.lessonId}`, { courseId: item.courseId, lessonId: item.lessonId })
        }
    }

    const dueLessons = [...needed.values()]
        .map(({ courseId, lessonId }) => vocabManifest.courses.find(course => course.id === courseId)?.lessons.find(lesson => lesson.id === lessonId))
        .filter((lesson): lesson is NonNullable<typeof lesson> => !!lesson)

    const candidateLessons = vocabManifest.courses
        .slice(0, 2)
        .flatMap(course => course.lessons.slice(0, 3))
    const lessons = [...new Map([...dueLessons, ...candidateLessons].map(lesson => [lesson.file, lesson])).values()]
    const loaded = await Promise.all(lessons.map(lesson => safe(() => loadLesson(lesson), [])))

    for (const words of loaded) {
        for (const word of words) {
            const key = word.word.trim().toLowerCase()
            const retrieval: RetrievalItem = {
                english: word.word,
                persian: word.meaning,
                courseId: word.courseId,
                lessonId: word.lessonId,
                due: needed.has(`${word.courseId}:${word.lessonId}`),
            }

            if (retrieval.due) snapshot.wordIndex.set(key, retrieval)
            if (snapshot.newWords.length < 8 && !retrieval.due && !studiedWordIds.has(key)) snapshot.newWords.push(retrieval)
        }
    }

    return snapshot
}

export async function loadContentSnapshot(
    studiedWordIds: Set<string>,
    dueProgress: WordProgress[]
): Promise<ContentSnapshot> {
    const available = new Set<ContentSource>()
    const wordIndex = new Map<string, RetrievalItem>()

    /* ---- vocabulary: index due words' lessons; pick new words ---- */
    const vocabManifest = await safe(loadManifest, null)

    const newWords: RetrievalItem[] = []

    if (vocabManifest?.courses.length) {
        available.add('vocabulary')

        const needed = new Map<string, { courseId: string; lessonId: string }>()

        for (const item of dueProgress) {
            if (item.courseId && item.lessonId) {
                needed.set(`${item.courseId}:${item.lessonId}`, { courseId: item.courseId, lessonId: item.lessonId })
            }
        }

        const dueLessons = [...needed.values()]
            .map(({ courseId, lessonId }) => vocabManifest.courses
                .find(course => course.id === courseId)
                ?.lessons.find(item => item.id === lessonId))
            .filter((lesson): lesson is NonNullable<typeof lesson> => !!lesson)
        const dueWords = await Promise.all(dueLessons.map(lesson => safe(() => loadLesson(lesson), [])))

        for (const words of dueWords) {
            for (const word of words) {
                wordIndex.set(word.word.trim().toLowerCase(), {
                    english: word.word,
                    persian: word.meaning,
                    courseId: word.courseId,
                    lessonId: word.lessonId,
                    due: true,
                })
            }
        }

        /* New words: first lessons in manifest order with unstudied words. */
        const candidateLessons = vocabManifest.courses.slice(0, 2).flatMap(course => course.lessons.slice(0, 3))
        const candidateWords = await Promise.all(candidateLessons.map(lesson => safe(() => loadLesson(lesson), [])))

        for (const words of candidateWords) {
            for (const word of words) {
                if (newWords.length >= 8) break
                if (studiedWordIds.has(word.word.trim().toLowerCase())) continue

                newWords.push({
                    english: word.word,
                    persian: word.meaning,
                    courseId: word.courseId,
                    lessonId: word.lessonId,
                    due: false,
                })
            }
            if (newWords.length >= 8) break
        }
    }

    /* ---- grammar ---- */
    const grammarManifest = await safe(loadGrammarManifest, null)
    const grammarExercises: PlannerInput['grammarExercises'] = []

    if (grammarManifest?.topics.length) {
        available.add('grammar')

        const loadedTopics = await Promise.all(
            grammarManifest.topics.map(topic => safe(() => loadGrammarTopic(topic), null))
        )

        grammarManifest.topics.forEach((topic, index) => {
            for (const exercise of loadedTopics[index]?.exercises ?? []) {
                grammarExercises.push({ topicId: topic.id, exercise })
            }
        })
    }

    /* ---- real-life scenarios = daily themes ---- */
    const realLifeManifest = await safe(loadRealLifeManifest, [])
    const themes: ThemeCandidate[] = []

    const loadedScenarios = await Promise.all(
        realLifeManifest.map(entry => safe(() => loadRealLifeScenario(entry), null))
    )

    realLifeManifest.forEach((entry, index) => {
        const scenario = loadedScenarios[index]

        if (!scenario) return

        themes.push({
            id: entry.id,
            title: entry.title,
            titlePersian: entry.titlePersian,
            cefrLevel: entry.cefrLevel,
            expressions: scenario.expressions.map(expression => ({
                english: expression.english,
                persian: expression.persian,
                example: expression.example,
                examplePersian: expression.examplePersian,
            })),
            exercises: scenario.exercises,
            speakingSentences: scenario.speakingTask.modelSentences,
            constructionPrompt: constructionFor(
                entry.id,
                scenario.expressions,
                scenario.speakingTask,
                scenario.speakingTask.modelSentences
            ),
        })
    })

    if (themes.length) available.add('real-life')

    /* ---- listening dictation ---- */
    const listeningManifest = await safe(loadListeningManifest, null)
    const dictationExercises: Exercise[] = []

    const loadedActivities = await Promise.all(
        (listeningManifest?.activities ?? []).map(entry => safe(() => loadListeningActivity(entry), null))
    )

    for (const activity of loadedActivities) {
        for (const exercise of activity?.exercises ?? []) {
            if (exercise.type === 'dictation') dictationExercises.push(exercise)
        }
    }

    /* ---- career questions (optional) ---- */
    const careerManifest = await safe(loadCareerManifest, [])
    const careerQuestions: PlannerInput['careerQuestions'] = []

    const careerSections = await Promise.all(
        careerManifest
            .filter(item => item.id === 'general' || item.id === 'remote')
            .map(section => safe(() => loadCareerSection(section), null))
    )

    for (const content of careerSections) {

        for (const question of content?.questions ?? []) {
            careerQuestions.push({ id: question.id, question: question.question })
        }
    }

    if (careerQuestions.length) available.add('career')

    /* Conversation scenarios ship with the app; treat as available when the AI-free content exists. */
    if (themes.length) available.add('conversation')

    const transferPatterns = await safe(loadTransferPatterns, [] as TransferPattern[])

    /* ---- cross-skill topic map: manifests only, no duplicate content ---- */
    const [readingManifest, speakingManifest, writingManifest] = await Promise.all([
        safe(loadReadingManifest, { version: 1, passages: [] }),
        safe(loadSpeakingManifest, { version: 1, topics: [] }),
        safe(loadWritingManifest, { version: 1, prompts: [] }),
    ])

    const metadata = (items: Array<{ id: string; title: string; titlePersian?: string; cefrLevel?: string; category?: string; domainTags?: string[]; learningObjectives?: unknown[] }>): IntegratedManifestItem[] => items.map(item => ({
        id: item.id,
        title: item.title,
        titlePersian: item.titlePersian,
        cefrLevel: item.cefrLevel,
        category: item.category,
        domainTags: item.domainTags,
        learningObjectives: (item.learningObjectives ?? []).map(objective =>
            typeof objective === 'string' ? { text: objective } : objective as { text: string; textPersian?: string },
        ),
    }))

    const integratedUnits = buildIntegratedUnits({
        realLife: metadata(realLifeManifest),
        grammar: metadata(grammarManifest?.topics ?? []),
        listening: metadata(listeningManifest?.activities ?? []),
        reading: metadata(readingManifest.passages),
        speaking: metadata(speakingManifest.topics),
        writing: metadata(writingManifest.prompts),
    })

    return {
        newWords,
        grammarExercises,
        themes,
        dictationExercises,
        careerQuestions,
        availableSources: [...available],
        transferPatterns,
        integratedUnits,
        wordIndex,
    }
}
