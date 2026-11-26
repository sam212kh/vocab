import type {
    RealLifeManifest,
    RealLifeScenario,
    RealLifeScenarioManifest,
} from '../types/realLife'

/** In-memory, per-session cache — see grammarContent.ts for why (Daily Journey loads every scenario on each rebuild). */
let realLifeManifestPromise: Promise<RealLifeScenarioManifest[]> | null = null
const realLifeScenarioCache = new Map<string, Promise<RealLifeScenario>>()

export function clearRealLifeContentCache(): void {
    realLifeManifestPromise = null
    realLifeScenarioCache.clear()
}

async function fetchRealLifeManifest(): Promise<RealLifeScenarioManifest[]> {
    const response = await fetch('/data/real-life/manifest.json')

    if (!response.ok) {
        throw new Error(`Could not load Real-Life scenarios (${response.status})`)
    }

    const manifest = (await response.json()) as RealLifeManifest

    if (!manifest || !Array.isArray(manifest.scenarios)) {
        throw new Error('Invalid Real-Life manifest format')
    }

    return manifest.scenarios
}

export function loadRealLifeManifest(): Promise<RealLifeScenarioManifest[]> {
    if (!realLifeManifestPromise) {
        realLifeManifestPromise = fetchRealLifeManifest().catch(error => {
            realLifeManifestPromise = null
            throw error
        })
    }

    return realLifeManifestPromise
}

async function fetchRealLifeScenario(
    manifest: RealLifeScenarioManifest,
    file: string
): Promise<RealLifeScenario> {
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

export function loadRealLifeScenario(
    manifest: RealLifeScenarioManifest
): Promise<RealLifeScenario> {
    const file = manifest.file.replace(/^\.\//, '').replace(/^\//, '')

    const cached = realLifeScenarioCache.get(file)
    if (cached) return cached

    const pending = fetchRealLifeScenario(manifest, file).catch(error => {
        realLifeScenarioCache.delete(file)
        throw error
    })

    realLifeScenarioCache.set(file, pending)
    return pending
}
