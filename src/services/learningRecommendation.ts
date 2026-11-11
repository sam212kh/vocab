import type { LearningGoalType } from '../types/learnerProfile'
import type { SkillName } from '../types/skillProfile'
import type { SkillPerformanceSummary } from '../types/performance'
import type {
    LearningActivity,
    LearningObjective,
    LearningRecommendation,
} from '../types/learning'

export interface RecommendationInput {
    studyDurationMinutes: number
    dueWordsCount: number
    hardWordsCount: number
    goals: LearningGoalType[]
    /** Grammar topics currently due for spaced review (ids). */
    dueGrammarTopics?: string[]
    /** Observed per-skill performance summaries (may be empty — never faked). */
    skillSummaries?: SkillPerformanceSummary[]
    /**
     * Confirmed-error categories recurring across AI writing evaluations
     * (from the mistakes store) — style suggestions are excluded upstream.
     */
    recurringWritingErrorCategories?: string[]
}

const GOAL_TO_SKILL: Record<LearningGoalType, SkillName> = {
    speaking: 'speaking',
    listening: 'listening',
    reading: 'reading',
    writing: 'writing',
    vocabulary: 'vocabulary',
    grammar: 'grammar',
    'professional-english': 'speaking',
    'travel-english': 'speaking',
    'exam-preparation': 'vocabulary',
}

const GOAL_DESCRIPTIONS: Record<LearningGoalType, string> = {
    speaking: 'Build confident, natural spoken English through regular practice.',
    listening: 'Train comprehension of natural spoken English.',
    reading: 'Build reading comprehension and reading speed.',
    writing: 'Build clear, well-structured written English.',
    vocabulary: 'Grow and retain active, usable vocabulary.',
    grammar: 'Build accurate and natural grammar in context.',
    'professional-english': 'Communicate confidently in work and interview settings.',
    'travel-english': 'Handle everyday travel conversations confidently.',
    'exam-preparation': 'Build the vocabulary and skills needed for exam performance.',
}

const SKILL_ACTIVITY: Record<SkillName, { type: LearningActivity['type']; label: string; route: string }> = {
    vocabulary: { type: 'daily-session', label: 'Daily Session', route: '/session' },
    grammar: { type: 'grammar-new', label: 'Grammar', route: '/grammar' },
    listening: { type: 'listening-practice', label: 'Listening', route: '/listening' },
    speaking: { type: 'guided-speaking', label: 'Guided Speaking', route: '/guided-speaking' },
    reading: { type: 'reading-practice', label: 'Reading', route: '/reading' },
    writing: { type: 'writing-practice', label: 'Writing', route: '/writing' },
}

/** Minimum observed events before a skill's accuracy is treated as meaningful. */
const MIN_EVENTS_FOR_WEAKNESS = 10

const WEAK_ACCURACY_THRESHOLD = 70

/*
 * Deterministic, explainable daily recommendation — no ML/AI. Priority
 * order per the Phase 3 spec:
 *   1. Due reviews (vocabulary SRS, grammar topic SRS)
 *   2. Repeated mistakes (from observed performance events)
 *   3. Weak skills (observed accuracy, only with enough data)
 *   4. Learning goals not yet covered today
 *   5. New activities
 * Minutes are allocated against the learner's stated study duration.
 * Every activity carries the concrete rule that produced it.
 */
export function buildDailyRecommendation(
    input: RecommendationInput
): LearningRecommendation {
    const objectives = deriveObjectives(input.goals)

    const activities: LearningActivity[] = []

    let remaining = Math.max(0, input.studyDurationMinutes)

    const coveredSkills = new Set<SkillName>()

    function push(activity: LearningActivity) {
        activities.push(activity)
        coveredSkills.add(activity.skill)
        remaining -= activity.estimatedMinutes
    }

    /* 1a. Vocabulary due reviews — always the anchor when time exists. */
    if (remaining > 0) {
        const sessionMinutes = Math.min(
            remaining,
            Math.max(10, Math.round(input.studyDurationMinutes * 0.4))
        )

        push({
            type: 'daily-session',
            label: 'Daily Session',
            route: '/session',
            estimatedMinutes: sessionMinutes,
            skill: 'vocabulary',
            reason: input.dueWordsCount > 0
                ? `${input.dueWordsCount} word${input.dueWordsCount === 1 ? '' : 's'} due for spaced-repetition review, mixed with a few new words.`
                : 'No words due for review yet — this session will introduce new vocabulary.',
        })
    }

    /* 1b. Grammar topics due for spaced review. */
    if (remaining > 0 && input.dueGrammarTopics?.length) {
        push({
            type: 'grammar-review',
            label: 'Grammar Review',
            route: '/grammar',
            estimatedMinutes: Math.min(remaining, 10),
            skill: 'grammar',
            reason: `${input.dueGrammarTopics.length} grammar topic${input.dueGrammarTopics.length === 1 ? '' : 's'} due for spaced review (${input.dueGrammarTopics.slice(0, 3).join(', ')}).`,
        })
    }

    /* 2a. Recurring confirmed writing errors → targeted writing practice. */
    if (remaining > 0 && input.recurringWritingErrorCategories?.length && !coveredSkills.has('writing')) {
        const categories = input.recurringWritingErrorCategories.slice(0, 3).join(', ')

        push({
            type: 'writing-practice',
            label: 'Writing',
            route: '/writing',
            estimatedMinutes: Math.min(remaining, 15),
            skill: 'writing',
            reason: `AI evaluations found recurring ${categories} errors across your recent writing — targeted practice recommended.`,
        })
    }

    /* 2b. Repeated mistakes → revisit that skill's module. */
    const summariesWithRepeats = (input.skillSummaries ?? [])
        .filter(summary => summary.repeatedMistakes.length > 0)
        .sort((a, b) => b.repeatedMistakes.length - a.repeatedMistakes.length)

    for (const summary of summariesWithRepeats) {
        if (remaining <= 0) break
        if (coveredSkills.has(summary.skill)) continue

        const target = SKILL_ACTIVITY[summary.skill]

        push({
            ...target,
            estimatedMinutes: Math.min(remaining, 10),
            skill: summary.skill,
            reason: `${summary.repeatedMistakes.length} ${summary.skill} exercise${summary.repeatedMistakes.length === 1 ? '' : 's'} answered wrong more than once — worth another look.`,
        })
    }

    /* 3. Weak skills — only with enough observed data, never guessed. */
    const weakSkills = (input.skillSummaries ?? [])
        .filter(
            summary =>
                summary.totalEvents >= MIN_EVENTS_FOR_WEAKNESS &&
                summary.accuracy < WEAK_ACCURACY_THRESHOLD
        )
        .sort((a, b) => a.accuracy - b.accuracy)

    for (const summary of weakSkills) {
        if (remaining <= 0) break
        if (coveredSkills.has(summary.skill)) continue

        const target = SKILL_ACTIVITY[summary.skill]

        push({
            ...target,
            estimatedMinutes: Math.min(remaining, 10),
            skill: summary.skill,
            reason: `Observed accuracy in ${summary.skill} is ${summary.accuracy}% over ${summary.totalEvents} exercises — extra practice recommended.`,
        })
    }

    /* 4. Stated goals not yet covered today. */
    for (const goal of input.goals) {
        if (remaining <= 0) break

        const skill = GOAL_TO_SKILL[goal]

        if (coveredSkills.has(skill)) continue

        const target = SKILL_ACTIVITY[skill]

        push({
            ...target,
            estimatedMinutes: Math.min(remaining, 15),
            skill,
            reason: `${capitalize(goal.replace(/-/g, ' '))} is one of your stated learning goals.`,
        })
    }

    /* 5. Leftover time → hard words, if any exist. */
    if (remaining > 0 && input.hardWordsCount > 0) {
        push({
            type: 'hard-words-review',
            label: 'Hard Words',
            route: '/hard-words',
            estimatedMinutes: remaining,
            skill: 'vocabulary',
            reason: `${input.hardWordsCount} word${input.hardWordsCount === 1 ? '' : 's'} marked hard are waiting, and there's time left in today's budget.`,
        })
    }

    const totalEstimatedMinutes = activities.reduce(
        (total, activity) => total + activity.estimatedMinutes,
        0
    )

    return {
        generatedAt: Date.now(),
        totalEstimatedMinutes,
        objectives,
        activities,
    }
}

function deriveObjectives(goals: LearningGoalType[]): LearningObjective[] {
    const seenSkills = new Set<SkillName>()

    const objectives: LearningObjective[] = []

    for (const goal of goals) {
        const skill = GOAL_TO_SKILL[goal]

        if (seenSkills.has(skill)) {
            continue
        }

        seenSkills.add(skill)

        objectives.push({
            skill,
            description: GOAL_DESCRIPTIONS[goal],
        })
    }

    return objectives
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1)
}
