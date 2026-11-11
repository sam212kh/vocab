import type { RoleplayScenario, ScenarioManifest } from '../types/conversation'

export async function loadScenarios(): Promise<RoleplayScenario[]> {
    const response = await fetch('/data/conversation/scenarios.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load conversation scenarios (${response.status})`)
    }

    const manifest = (await response.json()) as ScenarioManifest

    if (!manifest || !Array.isArray(manifest.scenarios)) {
        throw new Error('Invalid scenario manifest format')
    }

    return manifest.scenarios
}
