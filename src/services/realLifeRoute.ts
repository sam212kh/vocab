export const REAL_LIFE_ENTRY_STEPS = ['see', 'learn', 'practice', 'speak', 'use'] as const

export type RealLifeEntryStep = (typeof REAL_LIFE_ENTRY_STEPS)[number]

export interface RealLifeRouteTarget {
    scenarioId: string
    step: RealLifeEntryStep
}

function firstString(value: unknown): string | null {
    const candidate = Array.isArray(value) ? value[0] : value

    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

/**
 * Validates `?scenario=<id>&step=<step>` against what actually exists.
 * Unknown/missing scenario → null (generic Real-Life home).
 * Known scenario with a missing/unsupported step → opens at 'see'.
 * A step without a scenario is ignored.
 */
export function resolveRealLifeRoute(
    query: Record<string, unknown>,
    availableScenarioIds: readonly string[]
): RealLifeRouteTarget | null {
    const scenarioId = firstString(query.scenario)

    if (!scenarioId || !availableScenarioIds.includes(scenarioId)) return null

    const requested = firstString(query.step)
    const step = (REAL_LIFE_ENTRY_STEPS as readonly string[]).includes(requested ?? '')
        ? (requested as RealLifeEntryStep)
        : 'see'

    return { scenarioId, step }
}
