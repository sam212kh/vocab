/** One learning objective as listed in `public/data/objectives-index.json` (generated; do not edit by hand). */
export interface ObjectiveIndexEntry {
    /** Module-qualified topic, e.g. `real-life/making-tea`. */
    topic: string
    area: string
    topicTitle: string
    topicTitlePersian?: string
    cefr: string
    id: string
    text: string
    textPersian?: string
    /** Expressions the objective's exercises give evidence for. */
    targets: string[]
    exercises: { recognition: number; recall: number; sentence: number }
}

export interface ObjectiveIndexFile {
    version: number
    objectives: ObjectiveIndexEntry[]
}
