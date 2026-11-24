import { analyzeSkillGaps } from './skillGap'
import { summarizeItem } from './evidenceEngine'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useSkillProfileStore } from '../stores/skillProfile'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { useWordProgressStore } from '../stores/wordProgress'
import { usePerformanceStore } from '../stores/performance'
import { useMistakesStore } from '../stores/mistakes'
import { useConversationsStore } from '../stores/conversations'
import type { CefrLevel } from '../types/cefr'

export interface CoachLearnerContext {
    level: { value: CefrLevel | null; source: 'self-reported' | 'observed' | 'verified' | 'missing' }
    goals: string[]
    interests: string[]
    explanationLanguage: string
    recentlyLearned: string[]
    independentlyRecalled: string[]
    dueForReview: string[]
    recurringMistakes: Array<{
        category: string
        count: number
        examples: Array<{ original: string; corrected: string }>
    }>
    communication: Array<{
        dimension: string
        classification: string
        estimate: number | null
        observations: number
    }>
    recentConversationThemes: string[]
}

/** Build a bounded, evidence-backed context payload for the AI Coach. */
export function buildLearnerContext(now = Date.now()): CoachLearnerContext {
    const learner = useLearnerProfileStore().profile
    const skills = useSkillProfileStore().profile
    const ledger = useLearningEvidenceStore()
    const wordProgress = useWordProgressStore()
    const performance = usePerformanceStore()
    const mistakes = useMistakesStore()
    const conversations = useConversationsStore()

    const items = Object.values(ledger.items)
    const summaries = items.map(item => summarizeItem(item, now))
    const gaps = analyzeSkillGaps({ now, items, events: performance.events })
    const levelState = skills.skills.vocabulary.current ?? skills.skills.speaking.current

    return {
        level: {
            value: levelState?.level ?? learner.selfReportedLevel,
            source: levelState?.source ?? (learner.selfReportedLevel ? 'self-reported' : 'missing'),
        },
        goals: [...learner.goals].sort((a, b) => a.priority - b.priority).slice(0, 5).map(goal => goal.type),
        interests: learner.interests.slice(0, 5),
        explanationLanguage: learner.explanationLanguage,
        recentlyLearned: summaries
            .filter(item => item.kind === 'word' || item.kind === 'expression')
            .sort((a, b) => (b.lastObservedAt ?? 0) - (a.lastObservedAt ?? 0))
            .slice(0, 8)
            .map(item => item.key.replace(/^[^:]+:/, '')),
        independentlyRecalled: summaries
            .filter(item => item.independentSuccesses > 0 && ['recalled', 'produced', 'applied', 'retained'].includes(item.stage ?? ''))
            .sort((a, b) => b.independentSuccesses - a.independentSuccesses)
            .slice(0, 8)
            .map(item => item.key.replace(/^[^:]+:/, '')),
        dueForReview: wordProgress.getDueWords().slice(0, 8).map(item => item.wordId),
        recurringMistakes: mistakes.recurringErrors.slice(0, 5).map(item => ({
            category: item.category,
            count: item.count,
            examples: item.examples.slice(-2).map(example => ({ original: example.original, corrected: example.corrected })),
        })),
        communication: gaps.dimensions
            .filter(item => ['sentenceConstruction', 'speakingFluency', 'naturalExpression', 'contextualUsage', 'listening', 'writing'].includes(item.dimension))
            .map(item => ({
                dimension: item.dimension,
                classification: item.classification,
                estimate: item.estimate,
                observations: item.observations,
            })),
        recentConversationThemes: conversations.recentSummaries(3).map(summary => summary.suggestedNextActivity).filter(Boolean),
    }
}

export function serializeLearnerContext(context: CoachLearnerContext): string {
    return JSON.stringify(context).slice(0, 9000)
}
