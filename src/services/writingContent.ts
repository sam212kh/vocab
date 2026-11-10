import type { WritingManifest } from '../types/writing'

export async function loadWritingManifest(): Promise<WritingManifest> {
    const response = await fetch('/data/writing/manifest.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load writing prompts (${response.status})`)
    }

    const manifest = (await response.json()) as WritingManifest

    if (!manifest || !Array.isArray(manifest.prompts)) {
        throw new Error('Invalid writing manifest format')
    }

    return manifest
}
