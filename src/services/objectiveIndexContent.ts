import type { ObjectiveIndexEntry, ObjectiveIndexFile } from '../types/objectives'

/** Loads the generated objective index. Optional content: callers treat failure as "no goal information". */
export async function loadObjectiveIndex(): Promise<ObjectiveIndexEntry[]> {
    const response = await fetch('/data/objectives-index.json')

    if (!response.ok) throw new Error(`Could not load the objective index (${response.status})`)

    const file = (await response.json()) as ObjectiveIndexFile

    if (!file || !Array.isArray(file.objectives)) throw new Error('Invalid objective index format')

    return file.objectives
}
