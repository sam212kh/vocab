import type { ContentMetadata } from './vocabulary'
import type { Exercise } from './exercise'

export interface GrammarTopicManifest extends ContentMetadata {
    id: string
    title: string
    titlePersian?: string
    /** Topic group for display, e.g. "Tenses", "Sentence Structure". */
    category?: string
    file: string
}

export interface GrammarManifest {
    version: number
    topics: GrammarTopicManifest[]
}

export interface GrammarExample {
    english: string
    persian?: string
    /** Optional note on what the example demonstrates. */
    note?: string
}

export interface GrammarTopic {
    id: string
    title: string
    /** Short practical explanation — not a theory chapter. */
    explanation: string
    explanationPersian?: string
    examples: GrammarExample[]
    exercises: Exercise[]
}
