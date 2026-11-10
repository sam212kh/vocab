import type { SpeakingManifest } from '../types/speaking'

export async function loadSpeakingManifest(): Promise<SpeakingManifest> {
    const response = await fetch('/data/speaking/manifest.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load speaking topics (${response.status})`)
    }

    const manifest = (await response.json()) as SpeakingManifest

    if (!manifest || !Array.isArray(manifest.topics)) {
        throw new Error('Invalid speaking manifest format')
    }

    return manifest
}
