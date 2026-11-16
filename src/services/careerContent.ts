import type {
    CareerManifest,
    CareerSectionContent,
    CareerSectionId,
    CareerSectionManifest,
} from '../types/career'

export async function loadCareerManifest(): Promise<CareerSectionManifest[]> {
    const response = await fetch('/data/career/manifest.json', { cache: 'no-store' })

    if (!response.ok) {
        throw new Error(`Could not load Career English content (${response.status})`)
    }

    const manifest = (await response.json()) as CareerManifest

    if (!manifest || !Array.isArray(manifest.sections)) {
        throw new Error('Invalid Career manifest format')
    }

    return manifest.sections
}

export async function loadCareerSection(
    section: CareerSectionManifest
): Promise<CareerSectionContent> {
    const file = section.file.replace(/^\.\//, '').replace(/^\//, '')

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
