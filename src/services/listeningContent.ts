import type {
    ListeningActivity,
    ListeningActivityManifest,
    ListeningManifest,
} from '../types/listening'

/** In-memory, per-session cache — see grammarContent.ts for why (Daily Journey loads every activity on each rebuild). */
let listeningManifestPromise: Promise<ListeningManifest> | null = null
const listeningActivityCache = new Map<string, Promise<ListeningActivity>>()

export function clearListeningContentCache(): void {
    listeningManifestPromise = null
    listeningActivityCache.clear()
}

async function fetchListeningManifest(): Promise<ListeningManifest> {
    const response = await fetch('/data/listening/manifest.json')

    if (!response.ok) {
        throw new Error(`Could not load listening manifest (${response.status})`)
    }

    const manifest = (await response.json()) as ListeningManifest

    if (!manifest || !Array.isArray(manifest.activities)) {
        throw new Error('Invalid listening manifest format')
    }

    return manifest
}

export function loadListeningManifest(): Promise<ListeningManifest> {
    if (!listeningManifestPromise) {
        listeningManifestPromise = fetchListeningManifest().catch(error => {
            listeningManifestPromise = null
            throw error
        })
    }

    return listeningManifestPromise
}

async function fetchListeningActivity(
    activity: ListeningActivityManifest,
    file: string
): Promise<ListeningActivity> {
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

export function loadListeningActivity(
    activity: ListeningActivityManifest
): Promise<ListeningActivity> {
    const file = activity.file.replace(/^\.\//, '').replace(/^\//, '')

    const cached = listeningActivityCache.get(file)
    if (cached) return cached

    const pending = fetchListeningActivity(activity, file).catch(error => {
        listeningActivityCache.delete(file)
        throw error
    })

    listeningActivityCache.set(file, pending)
    return pending
}
