import type { ContentMetadata } from './vocabulary'
import type { Exercise } from './exercise'

export type ReadingKind =
    | 'passage'
    | 'dialogue'
    | 'story'
    | 'article'
    | 'professional'
    | 'technical'

export interface ReadingPassageManifest extends ContentMetadata {
    id: string
    title: string
    kind: ReadingKind
    /** Estimated reading time in minutes. */
    estimatedReadingTime?: number
    file: string
}

export interface ReadingManifest {
    version: number
    passages: ReadingPassageManifest[]
}

export interface ReadingVocabularyItem {
    word: string
    meaning: string
    /** Persian translation. */
    persian?: string
}

export interface ReadingParagraph {
    english: string
    /**
     * Optional Persian translation — shown only AFTER the learner has
     * attempted the passage, never automatically up front.
     */
    persian?: string
    /** For dialogues: who is speaking. */
    speaker?: string
}

export interface ReadingPassage {
    id: string
    title: string
    paragraphs: ReadingParagraph[]
    vocabulary: ReadingVocabularyItem[]
    exercises: Exercise[]
    learningObjectives?: string[]
}
