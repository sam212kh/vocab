import type { CefrLevel } from './cefr'
import type { FeedbackMode } from './conversation'
import type { ContentMetadata } from './vocabulary'

export interface ImmersiveChoice {
    id: string
    label: string
    labelPersian: string
    response: string
    nextStage: string
}

export interface ImmersiveStage {
    id: string
    prompt: string
    promptPersian: string
    choices?: ImmersiveChoice[]
}

export interface ImmersiveScenario extends ContentMetadata {
    id: string
    title: string
    titlePersian: string
    category: 'everyday' | 'travel' | 'workplace'
    cefrLevel: CefrLevel
    situation: string
    situationPersian: string
    aiRole: string
    learnerRole: string
    objective: string
    vocabulary: string[]
    usefulExpressions: Array<{ english: string; persian: string }>
    stages: ImmersiveStage[]
    opening: string
    completionCriteria: string
}

export interface ImmersiveManifest {
    version: number
    scenarios: Array<Pick<ImmersiveScenario, 'id' | 'title' | 'titlePersian' | 'category' | 'cefrLevel' | 'difficulty' | 'estimatedDuration'>>
}

export interface ImmersiveProgress {
    scenarioId: string
    attempts: number
    completed: number
    lastDifficulty: number
    lastCompletedAt: number | null
}

export type ImmersiveFeedbackMode = FeedbackMode
