import type { ContentMetadata } from './vocabulary'
import type { Exercise } from './exercise'

export type ListeningKind = 'sentences' | 'dialogue' | 'monologue'

export interface ListeningActivityManifest extends ContentMetadata {
    id: string
    title: string
    kind: ListeningKind
    file: string
}

export interface ListeningManifest {
    version: number
    activities: ListeningActivityManifest[]
}

export interface ListeningLine {
    /** Spoken via the existing TTS service. */
    english: string
    speaker?: string
    /** Revealed only in the post-exercise transcript review. */
    persian?: string
}

export interface ListeningActivity {
    id: string
    title: string
    /** Context shown BEFORE listening (situation, not content). */
    scenario?: string
    scenarioPersian?: string
    lines: ListeningLine[]
    exercises: Exercise[]
    learningObjectives?: string[]
}
