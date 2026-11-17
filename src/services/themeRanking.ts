import { normalizeKey } from './evidenceBridge'

import type { ThemeCandidate } from '../types/journey'
import type { ObjectiveIndexEntry } from '../types/objectives'

/**
 * Orders Daily Journey themes for THIS learner. PURE. The planner keeps its own rule (a theme
 * that overlaps due words wins; ties go to the first theme in the list), so this order decides
 * every tie: level fit first, then finishing what was started, then the original order.
 *
 *  - level: author-tagged band of the theme vs the learner's self-reported level. Slightly easier
 *    is fine, harder costs more (a B2 negotiation is not a good first theme for an A1 learner);
 *  - progress: the share of the theme's goal expressions already recalled (from the objective index;
 *    falls back to the theme's own expressions when the index has none);
 *  - a theme whose expressions are all recalled goes last: nothing new to teach there.
 */

const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const RECALLED = new Set(['recalled', 'produced', 'applied', 'retained'])

function bandPosition(label: string | null | undefined): number | null {
    if (!label) return null

    const positions = label.split('-').map(part => BANDS.indexOf(part.trim().toUpperCase())).filter(index => index >= 0)

    return positions.length ? positions.reduce((sum, value) => sum + value, 0) / positions.length : null
}

export interface ThemeRankInput {
    /** The learner's level (A1–C2). Unknown → B1, the app default. */
    level: string | null
    /** Evidence stage by normalized expression text. */
    stages: Record<string, string | null>
    index: ObjectiveIndexEntry[]
}

export interface RankedTheme {
    theme: ThemeCandidate
    levelCost: number
    /** 0..1 */
    recalledShare: number
}

export function rankThemes(themes: ThemeCandidate[], input: ThemeRankInput): ThemeCandidate[] {
    return rankDetails(themes, input).map(item => item.theme)
}

export function rankDetails(themes: ThemeCandidate[], input: ThemeRankInput): RankedTheme[] {
    const learner = bandPosition(input.level) ?? BANDS.indexOf('B1')

    const rows = themes.map((theme, order) => {
        const position = bandPosition(theme.cefrLevel)
        const gap = position === null ? 0 : position - learner
        const levelCost = gap > 0 ? gap * 2 : -gap

        const goalTargets = input.index.filter(entry => entry.topic === `real-life/${theme.id}`).flatMap(entry => entry.targets)
        const keys = (goalTargets.length ? goalTargets : theme.expressions.map(expression => expression.english)).map(normalizeKey)
        const recalled = keys.filter(key => RECALLED.has(input.stages[key] ?? '')).length
        const recalledShare = keys.length ? recalled / keys.length : 0

        return { theme, order, levelCost, recalledShare, started: keys.some(key => input.stages[key]) }
    })

    rows.sort((a, b) =>
        Number(a.recalledShare >= 1) - Number(b.recalledShare >= 1) ||
        a.levelCost - b.levelCost ||
        Number(b.started && b.recalledShare < 1) - Number(a.started && a.recalledShare < 1) ||
        a.order - b.order
    )

    return rows.map(({ theme, levelCost, recalledShare }) => ({ theme, levelCost, recalledShare }))
}
