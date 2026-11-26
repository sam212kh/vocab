import type {
    GrammarManifest,
    GrammarTopic,
    GrammarTopicManifest,
} from '../types/grammar'

/**
 * Grammar content loader — same runtime pattern as services/vocabulary.ts:
 * everything is fetched from /data/ (public/data/ on disk), content never
 * lives inside components.
 *
 * In-memory, per-session caching (same fix as vocabulary.ts's
 * loadManifest/loadLesson): Daily Journey planning (journeyContent.ts) loads
 * every grammar topic to build each day's plan, so without caching every
 * Journey rebuild re-fetched the entire grammar library from scratch.
 */
let grammarManifestPromise: Promise<GrammarManifest> | null = null
const grammarTopicCache = new Map<string, Promise<GrammarTopic>>()

export function clearGrammarContentCache(): void {
    grammarManifestPromise = null
    grammarTopicCache.clear()
}

async function fetchGrammarManifest(): Promise<GrammarManifest> {
    const response = await fetch('/data/grammar/manifest.json')

    if (!response.ok) {
        throw new Error(`Could not load grammar manifest (${response.status})`)
    }

    const manifest = (await response.json()) as GrammarManifest

    if (!manifest || !Array.isArray(manifest.topics)) {
        throw new Error('Invalid grammar manifest format')
    }

    return manifest
}

export function loadGrammarManifest(): Promise<GrammarManifest> {
    if (!grammarManifestPromise) {
        grammarManifestPromise = fetchGrammarManifest().catch(error => {
            grammarManifestPromise = null
            throw error
        })
    }

    return grammarManifestPromise
}

async function fetchGrammarTopic(
    topic: GrammarTopicManifest,
    file: string
): Promise<GrammarTopic> {
    const response = await fetch(`/data/grammar/${file}`)

    if (!response.ok) {
        throw new Error(`Failed to load grammar topic ${topic.id} (${response.status})`)
    }

    const raw = (await response.json()) as GrammarTopic

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exercises)) {
        throw new Error(`Invalid grammar topic format: ${topic.id}`)
    }

    return {
        id: raw.id ?? topic.id,
        title: raw.title ?? topic.title,
        explanation: raw.explanation ?? '',
        explanationPersian: raw.explanationPersian,
        examples: Array.isArray(raw.examples) ? raw.examples : [],
        exercises: raw.exercises,
    }
}

export function loadGrammarTopic(
    topic: GrammarTopicManifest
): Promise<GrammarTopic> {
    const file = topic.file.replace(/^\.\//, '').replace(/^\//, '')

    const cached = grammarTopicCache.get(file)
    if (cached) return cached

    const pending = fetchGrammarTopic(topic, file).catch(error => {
        grammarTopicCache.delete(file)
        throw error
    })

    grammarTopicCache.set(file, pending)
    return pending
}
