import type {
    GrammarManifest,
    GrammarTopic,
    GrammarTopicManifest,
} from '../types/grammar'

/**
 * Grammar content loader — same runtime pattern as services/vocabulary.ts:
 * everything is fetched from /data/ (public/data/ on disk), content never
 * lives inside components.
 */
export async function loadGrammarManifest(): Promise<GrammarManifest> {
    const response = await fetch('/data/grammar/manifest.json', {
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(`Could not load grammar manifest (${response.status})`)
    }

    const manifest = (await response.json()) as GrammarManifest

    if (!manifest || !Array.isArray(manifest.topics)) {
        throw new Error('Invalid grammar manifest format')
    }

    return manifest
}

export async function loadGrammarTopic(
    topic: GrammarTopicManifest
): Promise<GrammarTopic> {
    const file = topic.file.replace(/^\.\//, '').replace(/^\//, '')

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
