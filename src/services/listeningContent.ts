import type {
    ListeningActivity,
    ListeningActivityManifest,
    ListeningManifest,
} from '../types/listening'

export async function loadListeningManifest(): Promise<ListeningManifest> {
    const response = await fetch('/data/listening/manifest.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load listening manifest (${response.status})`)
    }

    const manifest = (await response.json()) as ListeningManifest

    if (!manifest || !Array.isArray(manifest.activities)) {
        throw new Error('Invalid listening manifest format')
    }

    return manifest
}

export async function loadListeningActivity(
    activity: ListeningActivityManifest
): Promise<ListeningActivity> {
    const file = activity.file.replace(/^\.\//, '').replace(/^\//, '')

    const response = await fetch(`/data/listening/${file}`)

    if (!response.ok) {
        throw new Error(`Failed to load listening activity ${activity.id} (${response.status})`)
    }

    const raw = (await response.json()) as ListeningActivity

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) {
        throw new Error(`Invalid listening activity format: ${activity.id}`)
    }

    return {
        id: raw.id ?? activity.id,
        title: raw.title ?? activity.title,
        scenario: raw.scenario,
        scenarioPersian: raw.scenarioPersian,
        lines: raw.lines,
        exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
        learningObjectives: raw.learningObjectives,
    }
}
