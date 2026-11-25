import type { ImmersiveManifest, ImmersiveScenario } from '../types/immersive'

export async function loadImmersiveManifest() {
    const response = await fetch('/data/immersive/manifest.json', { cache: 'no-store' })
    if (!response.ok) throw new Error(`Could not load immersive scenarios (${response.status})`)

    const manifest = (await response.json()) as ImmersiveManifest
    if (!manifest || !Array.isArray(manifest.scenarios)) throw new Error('Invalid immersive scenario manifest')
    return manifest.scenarios
}

export async function loadImmersiveScenario(id: string): Promise<ImmersiveScenario> {
    const response = await fetch(`/data/immersive/${encodeURIComponent(id)}.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Could not load immersive scenario (${response.status})`)

    const scenario = (await response.json()) as ImmersiveScenario
    if (!scenario || !scenario.id || !Array.isArray(scenario.stages) || !scenario.aiRole) {
        throw new Error(`Invalid immersive scenario: ${id}`)
    }
    return scenario
}

export function nextDifficulty(current: number, independentSuccesses: number, recentFailures: number): number {
    if (recentFailures >= 2) return Math.max(1, current - 1)
    if (independentSuccesses >= 3) return Math.min(5, current + 1)
    return current
}

export function scenarioComplete(learnerTurns: number, stageCount: number): boolean {
    return learnerTurns >= Math.max(3, stageCount)
}
