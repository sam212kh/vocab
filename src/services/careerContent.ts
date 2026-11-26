import type {
    CareerManifest,
    CareerSectionContent,
    CareerSectionId,
    CareerSectionManifest,
} from '../types/career'

/** In-memory, per-session cache — see grammarContent.ts for why (Daily Journey loads career sections on each rebuild). */
let careerManifestPromise: Promise<CareerSectionManifest[]> | null = null
const careerSectionCache = new Map<string, Promise<CareerSectionContent>>()

export function clearCareerContentCache(): void {
    careerManifestPromise = null
    careerSectionCache.clear()
}

async function fetchCareerManifest(): Promise<CareerSectionManifest[]> {
    const response = await fetch('/data/career/manifest.json')

    if (!response.ok) {
        throw new Error(`Could not load Career English content (${response.status})`)
    }

    const manifest = (await response.json()) as CareerManifest

    if (!manifest || !Array.isArray(manifest.sections)) {
        throw new Error('Invalid Career manifest format')
    }

    return manifest.sections
}

export function loadCareerManifest(): Promise<CareerSectionManifest[]> {
    if (!careerManifestPromise) {
        careerManifestPromise = fetchCareerManifest().catch(error => {
            careerManifestPromise = null
            throw error
        })
    }

    return careerManifestPromise
}

async function fetchCareerSection(
    section: CareerSectionManifest,
    file: string
): Promise<CareerSectionContent> {
    const response = await fetch(`/data/career/${file}`)

    if (!response.ok) {
        throw new Error(`Failed to load section ${section.id} (${response.status})`)
    }

    const raw = (await response.json()) as CareerSectionContent

    if (!raw || typeof raw !== 'object') {
        throw new Error(`Invalid section format: ${section.id}`)
    }

    return { ...raw, id: raw.id ?? (section.id as CareerSectionId) }
}

export function loadCareerSection(
    section: CareerSectionManifest
): Promise<CareerSectionContent> {
    const file = section.file.replace(/^\.\//, '').replace(/^\//, '')

    const cached = careerSectionCache.get(file)
    if (cached) return cached

    const pending = fetchCareerSection(section, file).catch(error => {
        careerSectionCache.delete(file)
        throw error
    })

    careerSectionCache.set(file, pending)
    return pending
}
