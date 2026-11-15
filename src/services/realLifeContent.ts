import type {
    RealLifeManifest,
    RealLifeScenario,
    RealLifeScenarioManifest,
} from '../types/realLife'

export async function loadRealLifeManifest(): Promise<RealLifeScenarioManifest[]> {
    const response = await fetch('/data/real-life/manifest.json', { cache: 'no-store' })

    if (!response.ok) {
        throw new Error(`Could not load Real-Life scenarios (${response.status})`)
    }

    const manifest = (await response.json()) as RealLifeManifest

    if (!manifest || !Array.isArray(manifest.scenarios)) {
        throw new Error('Invalid Real-Life manifest format')
    }

    return manifest.scenarios
}

export async function loadRealLifeScenario(
    manifest: RealLifeScenarioManifest
): Promise<RealLifeScenario> {
    const file = manifest.file.replace(/^\.\//, '').replace(/^\//, '')

    const response = await fetch(`/data/real-life/${file}`)

    if (!response.ok) {
        throw new Error(`Failed to load scenario ${manifest.id} (${response.status})`)
    }

    const raw = (await response.json()) as RealLifeScenario

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.expressions)) {
        throw new Error(`Invalid scenario format: ${manifest.id}`)
    }

    return raw
}
