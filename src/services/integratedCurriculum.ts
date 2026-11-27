import type { IntegratedSource, IntegratedUnit } from '../types/integrated'
import type { SkillName } from '../types/skillProfile'

export interface IntegratedManifestItem {
    id: string
    title: string
    titlePersian?: string
    cefrLevel?: string
    category?: string
    domainTags?: string[]
    learningObjectives?: { text: string; textPersian?: string }[]
}

export interface IntegratedManifestInputs {
    realLife: IntegratedManifestItem[]
    grammar: IntegratedManifestItem[]
    listening: IntegratedManifestItem[]
    reading: IntegratedManifestItem[]
    speaking: IntegratedManifestItem[]
    writing: IntegratedManifestItem[]
}

const SKILLS: Array<{ key: keyof IntegratedManifestInputs; skill: SkillName }> = [
    { key: 'grammar', skill: 'grammar' },
    { key: 'listening', skill: 'listening' },
    { key: 'reading', skill: 'reading' },
    { key: 'speaking', skill: 'speaking' },
    { key: 'writing', skill: 'writing' },
]

const STOP_WORDS = new Set(['about', 'and', 'for', 'from', 'how', 'the', 'their', 'this', 'your'])
const CATEGORY_SIGNALS: Record<string, string[]> = {
    kitchen: ['food', 'breakfast', 'cooking', 'routine', 'routines', 'day'],
    restaurant: ['food', 'ordering', 'restaurant', 'drinks'],
    'daily-routine': ['routine', 'routines', 'morning', 'day', 'work'],
    social: ['social', 'conversation', 'family', 'friends', 'weekend'],
    shopping: ['shopping', 'price', 'clothes', 'buy'],
    travel: ['travel', 'hotel', 'directions', 'transportation'],
    health: ['health', 'doctor', 'appointment', 'problem'],
    home: ['home', 'house', 'family'],
    phone: ['phone', 'call', 'appointment'],
    services: ['problem', 'appointment', 'help'],
}

/**
 * Connects existing authored manifests. A source is included only when its
 * title/objective/category has a deterministic topical match; missing content
 * stays missing instead of being represented by fabricated activities.
 */
export function buildIntegratedUnits(input: IntegratedManifestInputs): IntegratedUnit[] {
    return input.realLife.map(theme => {
        const themeText = `${theme.id} ${theme.title} ${theme.category ?? ''} ${(theme.domainTags ?? []).join(' ')} ${(theme.learningObjectives ?? []).map(item => item.text).join(' ')} ${(CATEGORY_SIGNALS[theme.category ?? ''] ?? []).join(' ')}`
        const themeTokens = tokens(themeText)
        const sources: IntegratedSource[] = []

        for (const { key, skill } of SKILLS) {
            const candidate = input[key]
                .map(item => ({ item, score: score(themeTokens, item) }))
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))[0]

            if (candidate) {
                sources.push({ skill, id: candidate.item.id, title: candidate.item.title, cefrLevel: candidate.item.cefrLevel })
            }
        }

        const objective = theme.learningObjectives?.[0]

        return {
            id: theme.id,
            title: theme.title,
            titlePersian: theme.titlePersian ?? theme.title,
            cefrLevel: theme.cefrLevel,
            objective: objective?.text ?? `Use English in ${theme.title}`,
            objectivePersian: objective?.textPersian,
            sources,
            skills: sources.map(source => source.skill),
        }
    })
}

function tokens(text: string): Set<string> {
    return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)))
}

function score(themeTokens: Set<string>, item: IntegratedManifestItem): number {
    const itemTokens = tokens(`${item.id} ${item.title} ${item.category ?? ''} ${(item.domainTags ?? []).join(' ')} ${(item.learningObjectives ?? []).map(objective => objective.text).join(' ')}`)
    let score = 0

    for (const token of itemTokens) if (themeTokens.has(token)) score++

    return score
}
