import { meaningRecallTarget } from './meaningRecall'
import { lexKey } from './evidenceBridge'

import type { ItemSummary } from '../types/evidence'
import type { Word, WordProgress } from '../types/vocabulary'

export type GuidedStepId = 'learn' | 'practice' | 'meaning-recall'

export interface GuidedStep {
    id: GuidedStepId
    title: string
    objective: string
    required: boolean
    route: (courseId: string, lessonId: string) => string
}

export interface GuidedStepStatus extends GuidedStep {
    eligible: boolean
    completed: boolean
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
    { id: 'learn', title: 'Learn expressions', objective: 'See the expression, meaning, examples and pronunciation.', required: true, route: (courseId, lessonId) => `/courses/${courseId}/lessons/${lessonId}` },
    { id: 'practice', title: 'Recall expressions', objective: 'Retrieve the English expression from its Persian meaning.', required: true, route: (courseId, lessonId) => `/practice?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}` },
    { id: 'meaning-recall', title: 'Recall meanings', objective: 'Recall every verified Persian meaning when a word has more than one.', required: true, route: (courseId, lessonId) => `/meaning-recall?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}` },
]

function attempted(progress: WordProgress | undefined): boolean {
    return !!progress && (progress.status !== 'new' || progress.correctAnswers > 0 || progress.wrongAnswers > 0)
}

function hasContext(summary: ItemSummary | null, context: string): boolean {
    return !!summary?.history.some(entry => entry.ctx === context && entry.mode !== 'view')
}

export function eligibleForMeaningRecall(words: Word[]): Word[] {
    return words.filter(word => meaningRecallTarget(word).expectedCount > 1)
}

export function guidedStepStatuses(
    words: Word[],
    progress: WordProgress[],
    evidenceFor: (key: string) => ItemSummary | null,
): GuidedStepStatus[] {
    const progressByWord = new Map(progress.filter(item => item.wordId).map(item => [item.wordId.trim().toLowerCase(), item]))
    const eligible = eligibleForMeaningRecall(words)
    const allIntroduced = words.length > 0 && words.every(word => {
        const summary = evidenceFor(lexKey(word.word))
        return summary?.stages.exposed.satisfied === true || attempted(progressByWord.get(word.word.trim().toLowerCase()))
    })
    const allPractised = words.length > 0 && words.every(word => attempted(progressByWord.get(word.word.trim().toLowerCase())))
    const allMeaningsRecalled = eligible.length > 0 && eligible.every(word => hasContext(evidenceFor(lexKey(word.word)), 'meaning-recall'))

    return GUIDED_STEPS.map(step => ({
        ...step,
        eligible: step.id !== 'meaning-recall' || eligible.length > 0,
        completed: step.id === 'learn' ? allIntroduced : step.id === 'practice' ? allPractised : eligible.length === 0 || allMeaningsRecalled,
    }))
}

export function nextGuidedStep(statuses: GuidedStepStatus[]): GuidedStepStatus | null {
    return statuses.find(step => step.eligible && !step.completed) ?? null
}

export function lessonComplete(statuses: GuidedStepStatus[]): boolean {
    return statuses.filter(step => step.required && step.eligible).every(step => step.completed)
}

