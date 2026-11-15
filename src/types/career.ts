import type { ContentMetadata } from './vocabulary'

/**
 * Career & Behavioral Interview English. Content under public/data/career/,
 * one file per section, manifest-driven like every other module.
 */

export type CareerSectionId =
    | 'general'
    | 'behavioral'
    | 'salary'
    | 'remote'
    | 'workplace'

export interface CareerSectionManifest extends ContentMetadata {
    id: CareerSectionId
    title: string
    titlePersian: string
    icon: string
    file: string
}

export interface CareerManifest {
    version: number
    sections: CareerSectionManifest[]
}

export interface CareerVocabularyItem {
    english: string
    persian: string
}

/** A study/practice unit: an interview question (general/salary/remote). */
export interface InterviewQuestion {
    id: string
    question: string
    questionPersian: string
    /** What the interviewer is actually probing for. */
    intention: string
    intentionPersian: string
    vocabulary: CareerVocabularyItem[]
    /** How to structure a good answer (short, practical). */
    structure: string
    /** A realistic, adaptable example — explicitly NOT a script to memorize. */
    example: string
    followUps: string[]
}

/** A behavioral scenario to be answered with the learner's OWN experience. */
export interface BehavioralScenario {
    id: string
    title: string
    titlePersian: string
    prompt: string
    promptPersian: string
    /** STAR guidance specific to this scenario. */
    starHints: {
        situation: string
        task: string
        action: string
        result: string
    }
    usefulPhrases: string[]
}

export interface WorkplaceDialogue {
    id: string
    title: string
    titlePersian: string
    lines: { speaker: string; english: string; persian: string }[]
    vocabulary: CareerVocabularyItem[]
}

export interface CareerSectionContent {
    id: CareerSectionId
    questions?: InterviewQuestion[]
    scenarios?: BehavioralScenario[]
    dialogues?: WorkplaceDialogue[]
}

/** The learner's own reusable answer, built on their REAL experiences. */
export interface SavedAnswer {
    id: string
    /** Linked question/scenario id, when built from one. */
    sourceId: string | null
    title: string
    star: {
        situation: string
        task: string
        action: string
        result: string
    }
    persianNotes: string
    finalAnswer: string
    createdAt: number
    updatedAt: number
}
