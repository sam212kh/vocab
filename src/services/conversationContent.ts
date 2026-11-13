import type { RoleplayScenario, ScenarioManifest } from '../types/conversation'

export async function loadScenarios(): Promise<RoleplayScenario[]> {
    const response = await fetch('/data/conversation/scenarios.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load conversation scenarios (${response.status})`)
    }

    /*
     * A missing file behind an SPA/nginx history fallback returns the HTML
     * index page with HTTP 200 — JSON.parse then fails with a cryptic
     * "unexpected character" error. Detect that case and say what is
     * actually wrong (see DEPLOY.md: public/data must be deployed).
     */
    const raw = await response.text()

    let manifest: ScenarioManifest

    try {
        manifest = JSON.parse(raw) as ScenarioManifest
    } catch {
        throw new Error(
            'Roleplay scenarios are missing on this server (/data/conversation/scenarios.json returned a non-JSON page). ' +
            'Deploy the latest public/data content — other conversation modes still work.'
        )
    }

    if (!manifest || !Array.isArray(manifest.scenarios)) {
        throw new Error('Invalid scenario manifest format')
    }

    return manifest.scenarios
}
