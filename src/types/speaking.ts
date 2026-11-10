import type { ContentMetadata } from './vocabulary'

export type SpeakingStepKind = 'repeat' | 'open'

export interface SpeakingStep {
    kind: SpeakingStepKind
    /**
     * repeat: the model sentence to say (transcript compared against it —
     * transcription accuracy, NOT phoneme-level pronunciation quality).
     * open: the question to answer freely (transcript recorded, never scored).
     */
    prompt: string
    promptPersian?: string
    /** For open steps: phrases the learner can lean on. */
    usefulPhrases?: string[]
}

export interface SpeakingTopic extends ContentMetadata {
    id: string
    title: string
    description?: string
    steps: SpeakingStep[]
}

export interface SpeakingManifest {
    version: number
    topics: SpeakingTopic[]
}
