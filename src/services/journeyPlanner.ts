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
    intro: 2,
    transfer: 4,
}

const STAGE_RANK = ['exposed', 'recognized', 'recalled', 'produced', 'applied', 'retained']

const normalizeText = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** Dimension → how the plan reacts when evidence CONFIRMS a weakness (never on insufficient evidence). */
const WEAKNESS_LABEL: Record<string, string> = {
    vocabRecall: 'active recall',
    sentenceConstruction: 'building sentences',
    naturalExpression: 'natural phrasing',
    grammarAccuracy: 'grammar accuracy',
    listening: 'listening',
    speakingFluency: 'speaking',
    contextualUsage: 'using language in new situations',
    vocabRecognition: 'word recognition',
}

export function planJourney(input: PlannerInput): JourneyPlan {
    const budget = BUDGET[input.length]
    const notes: string[] = []
    const recent = new Set(input.recentlyCompleted)

    /*
     * ADAPTIVE RULES (only when the caller supplies evidence — otherwise the
     * planner behaves exactly as before):
     *  E1 Items never shown are INTRODUCED before anything asks the learner to recall them.
     *  E2 Retention checkpoints (due/missed) order the due SRS words first — the SRS still decides WHAT is due.
     *  E3 Recognition only for items still below "recognized"; recall only for items below "recalled".
     *  E4 After recall and production comes a contextual-application (transfer) step.
     *  E5 A CONFIRMED weakness (never insufficient evidence) lets its activity into short sessions
     *     and is named in the objective.
     *  E6 Recognition never dominates: at most one recognition step and ≤ 35% of the planned time.
     */
    const ev = input.evidence
    const introduced = new Set(ev?.introduced ?? [])
    const weak = new Set((ev?.gaps ?? []).filter(gap => gap.classification === 'weakness').map(gap => gap.dimension))
    const stageOf = (text: string) => STAGE_RANK.indexOf(ev?.stages[normalizeText(text)] ?? '')

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

    /* ---- R1 (+E2): due SRS retrieval first ---- */
    const retentionRank = new Map((ev?.retentionDue ?? []).map((key, index) => [key, index]))
    const orderedDue = ev
        ? [...input.dueWords].sort((a, b) =>
            (retentionRank.get(normalizeText(a.english)) ?? Infinity) - (retentionRank.get(normalizeText(b.english)) ?? Infinity)
        )
        : input.dueWords

    const dueItems = orderedDue.slice(0, budget.dueCap)
    const checkpointCount = ev ? dueItems.filter(item => retentionRank.has(normalizeText(item.english))).length : 0

    if (dueItems.length && fits(MINUTES.retrieval)) {
        const batch = dueItems.slice(0, input.length === 'quick' ? 4 : 6)

        push({
            id: `vocab-retrieval:due:0`,
            kind: 'vocab-retrieval',
            stage: 'recall',
            skill: 'vocabulary',
            title: 'Recall your due words',
            estimatedMinutes: MINUTES.retrieval,
            reason: `${input.dueWords.length} word${input.dueWords.length === 1 ? ' is' : 's are'} due for spaced review — retrieval without options strengthens memory most.${checkpointCount ? ` ${checkpointCount} of them also check whether you still remember after several days.` : ''}`,
            sourceId: 'due-words',
            retrievalItems: batch,
        })
    }

    /* ---- Theme block: intro → recognition → recall → production → application → speaking ---- */
    if (theme) {
        const expressionItems: RetrievalItem[] = theme.expressions.slice(0, 5).map(expression => ({
            english: expression.english,
            persian: expression.persian,
            courseId: 'real-life',
            lessonId: theme.id,
            due: false,
        }))

        const mcExercises = theme.exercises.filter(isRecognitionExercise).slice(0, 3)

        /* E1: introduce what the learner has never been shown. */
        let recallable = expressionItems

        if (ev) {
            const unseen = theme.expressions.slice(0, 5).filter(expression => !introduced.has(normalizeText(expression.english)))

            if (unseen.length && fits(MINUTES.intro)) {
                const shown = unseen.slice(0, 4)

                push({
                    id: `new-material-intro:${theme.id}:0`,
                    kind: 'new-material-intro',
                    stage: 'recognition',
                    skill: 'vocabulary',
                    title: `Meet new phrases: ${theme.title}`,
                    estimatedMinutes: MINUTES.intro,
                    reason: `${shown.length} phrase${shown.length === 1 ? '' : 's'} in today's theme ${shown.length === 1 ? 'is' : 'are'} new to you — look and listen first; recall comes after you have seen them.`,
                    sourceId: `${theme.id}:intro`,
                    introItems: shown.map(expression => ({
                        english: expression.english,
                        persian: expression.persian,
                        example: expression.example,
                        examplePersian: expression.examplePersian,
                    })),
                })

                const shownKeys = new Set(shown.map(expression => normalizeText(expression.english)))

                recallable = expressionItems.filter(item => introduced.has(normalizeText(item.english)) || shownKeys.has(normalizeText(item.english)))
            } else {
                recallable = expressionItems.filter(item => introduced.has(normalizeText(item.english)))

                if (unseen.length) notes.push('There was no time left to introduce the new phrases in this theme, so they were not tested.')
            }
        }

        /* E3: recognition only where recognition is still the right level. */
        const needsRecognition = !ev || expressionItems.some(item => stageOf(item.english) < STAGE_RANK.indexOf('recognized'))

        /* E5: in a short session a CONFIRMED weakness gets the time that recognition would use. */
        const weakPriority = input.length === 'quick' && ['sentenceConstruction', 'naturalExpression', 'contextualUsage', 'listening', 'speakingFluency'].some(dimension => weak.has(dimension))

        if (mcExercises.length && needsRecognition && !weakPriority && fits(MINUTES.recognition)) {
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
        } else if (ev && mcExercises.length && weakPriority) {
            notes.push('Recognition warm-up skipped in this short session so time goes to the skill your evidence shows needs work.')
        } else if (ev && mcExercises.length && !needsRecognition) {
            notes.push('Recognition warm-up skipped: you already recognize this theme\'s phrases, so time goes to recall and use.')
        }

        /* E3: recall only items that still need recall evidence. */
        const recallItems = ev ? recallable.filter(item => stageOf(item.english) < STAGE_RANK.indexOf('recalled')) : recallable

        if (recallItems.length && fits(MINUTES.retrieval)) {
            push({
                id: `vocab-retrieval:${theme.id}:1`,
                kind: 'vocab-retrieval',
                stage: 'recall',
                skill: 'vocabulary',
                title: `Recall: ${theme.title} phrases`,
                estimatedMinutes: MINUTES.retrieval,
                reason: 'Typing the English from the Persian meaning is recall — a stronger memory signal than choosing from options.',
                sourceId: `${theme.id}:recall`,
                retrievalItems: recallItems,
            })
        } else if (ev && recallable.length && !recallItems.length) {
            notes.push('Recall step skipped: you already recall this theme\'s phrases independently.')
        }

        const allowProduction = input.length !== 'quick' || weak.has('sentenceConstruction') || weak.has('naturalExpression')

        if (theme.constructionPrompt && allowProduction && fits(MINUTES.construction)) {
            push({
                id: `sentence-construction:${theme.id}:2`,
                kind: 'sentence-construction',
                stage: 'production',
                skill: 'writing',
                title: 'Build your own sentence',
                estimatedMinutes: MINUTES.construction,
                reason: weak.has('sentenceConstruction')
                    ? 'Building sentences is where your evidence shows the biggest gap — the step multiple-choice cannot replace.'
                    : 'Production: you construct a sentence using the theme language — the step multiple-choice cannot replace.',
                sourceId: `${theme.id}:construction`,
                construction: theme.constructionPrompt,
            })
        }

        /* E4: contextual application — the same pattern in a situation the learner has not practised. */
        const transferTask = ev?.transfer.task ?? null

        if (ev && transferTask && (input.length !== 'quick' || weak.has('contextualUsage')) && fits(MINUTES.transfer)) {
            push({
                id: `contextual-application:${transferTask.contextId}:3`,
                kind: 'contextual-application',
                stage: 'production',
                skill: 'writing',
                title: 'Use it in a new situation',
                estimatedMinutes: MINUTES.transfer,
                reason: `You already know "${transferTask.anchorExpression}". Now use the same kind of language in a situation you have not practised.`,
                sourceId: `transfer:${transferTask.patternId}:${transferTask.contextId}`,
                construction: transferTask.prompt,
                transfer: {
                    patternId: transferTask.patternId,
                    contextId: transferTask.contextId,
                    level: transferTask.level,
                    anchorExpression: transferTask.anchorExpression,
                    matches: transferTask.matches ?? [],
                    learn: transferTask.learn,
                },
            })
        } else if (ev && !transferTask && input.length !== 'quick' && ev.transfer.reason === 'no-acquired-expression') {
            notes.push('New-situation practice unlocks once you can recall an expression built on a reusable pattern (for example "Could I have…?").')
        }

        const allowSpeaking = input.length !== 'quick' || weak.has('speakingFluency')

        if (input.speakingEnabled && theme.speakingSentences.length && allowSpeaking && fits(MINUTES.speaking)) {
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

        if (ev && fresh.length && fits(MINUTES.intro)) {
            const unseen = fresh.filter(word => !introduced.has(normalizeText(word.english)))

            if (unseen.length) {
                push({
                    id: 'new-material-intro:new:0',
                    kind: 'new-material-intro',
                    stage: 'recognition',
                    skill: 'vocabulary',
                    title: 'Meet new words',
                    estimatedMinutes: MINUTES.intro,
                    reason: 'Nothing is due for review, so today introduces a few new words — look and listen before recalling them.',
                    sourceId: 'new-words-intro',
                    introItems: unseen.map(word => ({ english: word.english, persian: word.persian })),
                })
            }
        }

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
        weak.has('grammarAccuracy') ||
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

    if (dictationPool.length && (input.length !== 'quick' || weak.has('listening')) && fits(MINUTES.dictation)) {
        const picks = dictationPool.slice(0, 2)

        push({
            id: `listening-dictation:${picks[0].id}:5`,
            kind: 'listening-dictation',
            stage: 'recall',
            skill: 'listening',
            title: 'Listen and write',
            estimatedMinutes: MINUTES.dictation,
            reason: weak.has('listening')
                ? 'Your listening evidence is below target — dictation trains it with no options to guess from.'
                : 'Dictation trains listening and independent spelling in one step — no options to guess from.',
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

    /* ---- E6: recognition never dominates ---- */
    if (ev) {
        const recognitionSteps = activities.filter(a => a.kind === 'recognition-quiz' || a.kind === 'grammar-in-context')
        const recognitionMinutes = recognitionSteps.reduce((sum, a) => sum + a.estimatedMinutes, 0)

        if (activities.length >= 3 && recognitionMinutes / Math.max(minutesUsed, 1) > 0.35) {
            const drop = recognitionSteps.find(a => a.kind === 'recognition-quiz')

            if (drop) {
                activities.splice(activities.indexOf(drop), 1)
                minutesUsed -= drop.estimatedMinutes
                notes.push('A recognition step was removed so the session is not dominated by easy multiple-choice work.')
            }
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

    if (ev && activities.length && minutesUsed < budget.minutes * 0.6) {
        notes.push(`Only ${minutesUsed} of ${budget.minutes} minutes could be filled with suitable material today.`)
    }

    return {
        length: input.length,
        objective: buildObjective(theme, dueItems.length, input, ev ? [...weak] : []),
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
    input: PlannerInput,
    weakDimensions: string[] = []
): string {
    const focus = weakDimensions.length
        ? ` Focus: ${weakDimensions.map(dimension => WEAKNESS_LABEL[dimension] ?? dimension).slice(0, 2).join(' and ')}, where your evidence shows the biggest gap.`
        : ''

    if (theme) {
        return `Talk about "${theme.title}" in natural English — recognize it, recall it, then use it yourself.${focus}`
    }

    if (dueCount) {
        return `Strengthen ${dueCount} word${dueCount === 1 ? '' : 's'} that are due, then practice using them.${focus}`
    }

    if (input.newWords.length) {
        return `Learn a few new words and practice recalling them.${focus}`
    }

    return `Keep your English active with a short mixed practice.${focus}`
}

export function stageOrder(stage: LearningStage): number {
    return ['recognition', 'recall', 'production', 'fluency'].indexOf(stage)
}
