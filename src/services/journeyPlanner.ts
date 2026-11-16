import { JOURNEY_LENGTH_MINUTES } from '../types/journey'

import type {
    JourneyActivity,
    JourneyPlan,
    LearningStage,
    PlannerInput,
    RetrievalItem,
    ThemeCandidate,
} from '../types/journey'

/**
 * Deterministic, explainable daily planner. PURE: same input → same plan.
 * No randomness, no clock, no store access — the caller snapshots state.
 *
 * Decision rules (documented in docs/PHASE7.md):
 *  R1  Due SRS words come FIRST (retention beats novelty), capped per length.
 *  R2  A coherent THEME (one real-life scenario) is chosen when available:
 *      first not recently completed, in stable manifest order; due-word
 *      overlap with its expressions breaks ties. No theme → vocabulary/
 *      grammar-driven session (notes explain the degradation).
 *  R3  Stage balance: recognition is a warm-up only. Every plan with enough
 *      budget includes a RECALL step; standard/extended also include a
 *      PRODUCTION step. A plan never consists of recognition alone.
 *  R4  Weak skills / recurring mistakes bias the optional slots toward
 *      grammar-in-context and sentence construction.
 *  R5  No-repeat: anything in recentlyCompleted is skipped when an
 *      alternative exists.
 *  R6  Speaking activities only when speaking is enabled.
 *  R7  Empty/missing sources never throw — they are omitted and noted.
 *  R8  Activity count targets: quick 3-4, standard 4-6, extended 5-6
 *      (the spec's 4-6 micro-activities, scaled to the available time).
 */

const BUDGET: Record<string, { minutes: number; maxActivities: number; minActivities: number; dueCap: number }> = {
    quick: { minutes: JOURNEY_LENGTH_MINUTES.quick, maxActivities: 4, minActivities: 2, dueCap: 5 },
    standard: { minutes: JOURNEY_LENGTH_MINUTES.standard, maxActivities: 6, minActivities: 4, dueCap: 8 },
    extended: { minutes: JOURNEY_LENGTH_MINUTES.extended, maxActivities: 6, minActivities: 5, dueCap: 12 },
}

const MINUTES = {
    retrieval: 3,
    recognition: 2,
    grammar: 3,
    dictation: 3,
    construction: 4,
    speaking: 3,
    roleplay: 8,
    career: 6,
}

export function planJourney(input: PlannerInput): JourneyPlan {
    const budget = BUDGET[input.length]
    const notes: string[] = []
    const recent = new Set(input.recentlyCompleted)

    const activities: JourneyActivity[] = []
    let minutesUsed = 0

    /*
     * Extended sessions RESERVE two slots for the fluency/production
     * hand-offs (roleplay, career) so optional grammar/dictation can't
     * crowd them out — those are the steps recognition-heavy plans lack.
     */
    const reservedSlots = input.length === 'extended'
        ? (input.themes.length ? 1 : 0) + (input.careerQuestions.length ? 1 : 0)
        : 0

    const fits = (minutes: number, reserved = true) =>
        activities.length < budget.maxActivities - (reserved ? reservedSlots : 0) &&
        minutesUsed + minutes <= budget.minutes + 2

    const push = (activity: JourneyActivity) => {
        activities.push(activity)
        minutesUsed += activity.estimatedMinutes
    }

    /* ---- R2: theme selection ---- */
    const theme = chooseTheme(input.themes, input.dueWords, recent)

    if (!input.themes.length) {
        notes.push('No Real-Life scenarios are available — session is built from vocabulary and grammar.')
    } else if (!theme) {
        notes.push('All Real-Life scenarios were practiced recently — no theme today.')
    }

    /* ---- R1: due SRS retrieval first ---- */
    const dueItems = input.dueWords.slice(0, budget.dueCap)

    if (dueItems.length && fits(MINUTES.retrieval)) {
        const batch = dueItems.slice(0, input.length === 'quick' ? 4 : 6)

        push({
            id: `vocab-retrieval:due:0`,
            kind: 'vocab-retrieval',
            stage: 'recall',
            skill: 'vocabulary',
            title: 'Recall your due words',
            estimatedMinutes: MINUTES.retrieval,
            reason: `${input.dueWords.length} word${input.dueWords.length === 1 ? ' is' : 's are'} due for spaced review — retrieval without options strengthens memory most.`,
            sourceId: 'due-words',
            retrievalItems: batch,
        })
    }

    /* ---- Theme block: recognition warm-up → recall → production → speaking ---- */
    if (theme) {
        const expressionItems: RetrievalItem[] = theme.expressions.slice(0, 5).map(expression => ({
            english: expression.english,
            persian: expression.persian,
            courseId: 'real-life',
            lessonId: theme.id,
            due: false,
        }))

        const mcExercises = theme.exercises.filter(isRecognitionExercise).slice(0, 3)

        if (mcExercises.length && fits(MINUTES.recognition)) {
            push({
                id: `recognition-quiz:${theme.id}:0`,
                kind: 'recognition-quiz',
                stage: 'recognition',
                skill: 'vocabulary',
                title: `Warm-up: ${theme.title}`,
                estimatedMinutes: MINUTES.recognition,
                reason: `Today's theme is "${theme.title}" — a quick recognition warm-up before you have to produce the language yourself.`,
                sourceId: `${theme.id}:recognition`,
                exercises: mcExercises,
            })
        }

        if (expressionItems.length && fits(MINUTES.retrieval)) {
            push({
                id: `vocab-retrieval:${theme.id}:1`,
                kind: 'vocab-retrieval',
                stage: 'recall',
                skill: 'vocabulary',
                title: `Recall: ${theme.title} phrases`,
                estimatedMinutes: MINUTES.retrieval,
                reason: 'Typing the English from the Persian meaning is recall — a stronger memory signal than choosing from options.',
                sourceId: `${theme.id}:recall`,
                retrievalItems: expressionItems,
            })
        }

        if (theme.constructionPrompt && input.length !== 'quick' && fits(MINUTES.construction)) {
            push({
                id: `sentence-construction:${theme.id}:2`,
                kind: 'sentence-construction',
                stage: 'production',
                skill: 'writing',
                title: 'Build your own sentence',
                estimatedMinutes: MINUTES.construction,
                reason: 'Production: you construct a sentence using the theme language — the step multiple-choice cannot replace.',
                sourceId: `${theme.id}:construction`,
                construction: theme.constructionPrompt,
            })
        }

        if (input.speakingEnabled && theme.speakingSentences.length && input.length !== 'quick' && fits(MINUTES.speaking)) {
            push({
                id: `speaking:${theme.id}:3`,
                kind: 'speaking',
                stage: 'fluency',
                skill: 'speaking',
                title: 'Say it out loud',
                estimatedMinutes: MINUTES.speaking,
                reason: 'Speaking the theme sentences aloud (transcript-compared — not pronunciation scoring).',
                sourceId: `${theme.id}:speaking`,
                speakingSentences: theme.speakingSentences.slice(0, 3),
            })
        }
    } else if (!dueItems.length) {
        /* No theme and nothing due: fall back to NEW words so the session isn't empty. */
        const fresh = input.newWords.filter(word => !recent.has(`new:${word.english}`)).slice(0, 5)

        if (fresh.length && fits(MINUTES.retrieval)) {
            push({
                id: 'vocab-retrieval:new:0',
                kind: 'vocab-retrieval',
                stage: 'recall',
                skill: 'vocabulary',
                title: 'Learn and recall new words',
                estimatedMinutes: MINUTES.retrieval,
                reason: 'Nothing is due for review, so today introduces a few new words with immediate recall.',
                sourceId: 'new-words',
                retrievalItems: fresh,
            })
        }
    }

    /* ---- R4: grammar in context, biased by weakness ---- */
    const weakGrammar =
        input.weakSkills.includes('grammar') ||
        input.recurringMistakeCategories.length > 0 ||
        input.dueGrammarTopics.length > 0

    const grammarPool = input.grammarExercises.filter(item => !recent.has(item.exercise.id))

    if (grammarPool.length && fits(MINUTES.grammar) && (weakGrammar || activities.length < budget.minActivities)) {
        const preferred = input.dueGrammarTopics.length
            ? grammarPool.filter(item => input.dueGrammarTopics.includes(item.topicId))
            : grammarPool

        const picks = (preferred.length ? preferred : grammarPool).slice(0, 3)

        push({
            id: `grammar-in-context:${picks[0].topicId}:4`,
            kind: 'grammar-in-context',
            stage: 'recognition',
            skill: 'grammar',
            title: 'Grammar in context',
            estimatedMinutes: MINUTES.grammar,
            reason: input.dueGrammarTopics.length
                ? `Grammar topic "${picks[0].topicId}" is due for spaced review.`
                : input.recurringMistakeCategories.length
                    ? `Your recent feedback shows recurring ${input.recurringMistakeCategories.slice(0, 2).join(', ')} issues.`
                    : 'Grammar practice keeps accuracy balanced with vocabulary work.',
            sourceId: picks.map(item => item.exercise.id).join('+'),
            exercises: picks.map(item => item.exercise),
        })
    }

    /* ---- Dictation (listening) ---- */
    const dictationPool = input.dictationExercises.filter(exercise => !recent.has(exercise.id))

    if (dictationPool.length && input.length !== 'quick' && fits(MINUTES.dictation)) {
        const picks = dictationPool.slice(0, 2)

        push({
            id: `listening-dictation:${picks[0].id}:5`,
            kind: 'listening-dictation',
            stage: 'recall',
            skill: 'listening',
            title: 'Listen and write',
            estimatedMinutes: MINUTES.dictation,
            reason: 'Dictation trains listening and independent spelling in one step — no options to guess from.',
            sourceId: picks.map(exercise => exercise.id).join('+'),
            exercises: picks,
        })
    }

    /* ---- Extended: hand-off activities in existing modules ---- */
    if (input.length === 'extended') {
        if (theme && fits(MINUTES.roleplay, false)) {
            push({
                id: `roleplay:${theme.id}:6`,
                kind: 'roleplay',
                stage: 'fluency',
                skill: 'speaking',
                title: `Roleplay: ${theme.title}`,
                estimatedMinutes: MINUTES.roleplay,
                reason: 'Using the language in a live conversation is the fluency step.',
                sourceId: `${theme.id}:roleplay`,
                route: { path: '/real-life', query: { scenario: theme.id, step: 'use' } },
            })
        }

        const question = input.careerQuestions.find(item => !recent.has(item.id))

        if (question && fits(MINUTES.career, false)) {
            push({
                id: `career-question:${question.id}:7`,
                kind: 'career-question',
                stage: 'production',
                skill: 'speaking',
                title: 'Career answer practice',
                estimatedMinutes: MINUTES.career,
                reason: 'Professional English needs its own practice — answer one real interview question.',
                sourceId: question.id,
                route: { path: '/career-english' },
            })
        }
    }

    /* ---- R3: stage balance guard ---- */
    const hasRecallOrBetter = activities.some(a => a.stage !== 'recognition')

    if (activities.length && !hasRecallOrBetter) {
        notes.push('Only recognition content was available — add vocabulary or scenarios to unlock recall and production steps.')
    }

    if (!activities.length) {
        notes.push('No learning content is available right now — check that lesson data is deployed.')
    }

    return {
        length: input.length,
        objective: buildObjective(theme, dueItems.length, input),
        theme: theme ? { id: theme.id, title: theme.title, titlePersian: theme.titlePersian } : null,
        activities,
        totalEstimatedMinutes: minutesUsed,
        notes,
    }
}

function isRecognitionExercise(exercise: { type: string }): boolean {
    return exercise.type === 'multiple-choice' || exercise.type === 'matching'
}

/**
 * Stable theme choice: skip recently completed; among the rest prefer the
 * one whose expressions overlap the due words most; ties → manifest order.
 */
function chooseTheme(
    themes: ThemeCandidate[],
    dueWords: RetrievalItem[],
    recent: Set<string>
): ThemeCandidate | null {
    const candidates = themes.filter(theme => !recent.has(theme.id))

    if (!candidates.length) return null

    const dueSet = new Set(dueWords.map(word => word.english.toLowerCase()))

    let best = candidates[0]
    let bestOverlap = -1

    for (const theme of candidates) {
        const overlap = theme.expressions.filter(expression => dueSet.has(expression.english.toLowerCase())).length

        if (overlap > bestOverlap) {
            best = theme
            bestOverlap = overlap
        }
    }

    return best
}

function buildObjective(
    theme: ThemeCandidate | null,
    dueCount: number,
    input: PlannerInput
): string {
    if (theme) {
        return `Talk about "${theme.title}" in natural English — recognize it, recall it, then use it yourself.`
    }

    if (dueCount) {
        return `Strengthen ${dueCount} word${dueCount === 1 ? '' : 's'} that are due, then practice using them.`
    }

    if (input.newWords.length) {
        return 'Learn a few new words and practice recalling them.'
    }

    return 'Keep your English active with a short mixed practice.'
}

export function stageOrder(stage: LearningStage): number {
    return ['recognition', 'recall', 'production', 'fluency'].indexOf(stage)
}
