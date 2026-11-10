import type {
    ReadingManifest,
    ReadingPassage,
    ReadingPassageManifest,
} from '../types/reading'

export async function loadReadingManifest(): Promise<ReadingManifest> {
    const response = await fetch('/data/reading/manifest.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load reading manifest (${response.status})`)
    }

    const manifest = (await response.json()) as ReadingManifest

    if (!manifest || !Array.isArray(manifest.passages)) {
        throw new Error('Invalid reading manifest format')
    }

    return manifest
}

export async function loadReadingPassage(
    passage: ReadingPassageManifest
): Promise<ReadingPassage> {
    const file = passage.file.replace(/^\.\//, '').replace(/^\//, '')

    const response = await fetch(`/data/reading/${file}`)

    if (!response.ok) {
        throw new Error(`Failed to load reading passage ${passage.id} (${response.status})`)
    }

    const raw = (await response.json()) as ReadingPassage

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.paragraphs)) {
        throw new Error(`Invalid reading passage format: ${passage.id}`)
    }

    return {
        id: raw.id ?? passage.id,
        title: raw.title ?? passage.title,
        paragraphs: raw.paragraphs,
        vocabulary: Array.isArray(raw.vocabulary) ? raw.vocabulary : [],
        exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
        learningObjectives: raw.learningObjectives,
    }
}
