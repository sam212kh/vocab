import type { CefrLevel } from './cefr'

export type SkillName =
    | 'vocabulary'
    | 'grammar'
    | 'listening'
    | 'speaking'
    | 'reading'
    | 'writing'

export const SKILL_NAMES: SkillName[] = [
    'vocabulary',
    'grammar',
    'listening',
    'speaking',
    'reading',
    'writing',
]

/**
 * Distinguishes HOW a proficiency estimate was produced, since these carry
 * very different weight:
 * - self-reported: the learner's own guess. Low confidence by convention.
 * - observed: inferred from exercise performance over multiple activities
 *   (not a single quiz). Still not a certified result.
 * - verified: produced by an actual placement/skill assessment module.
 *   None exists yet in this phase — reserved for later.
 */
export type ProficiencySource = 'self-reported' | 'observed' | 'verified'

export interface ProficiencyEstimate {
    level: CefrLevel
    source: ProficiencySource
    /** 0-1. Self-reported estimates are always low confidence by convention. */
    confidence: number
    recordedAt: number
}

export interface AssessmentResult {
    skill: SkillName
    level: CefrLevel
    source: ProficiencySource
    confidence: number
    recordedAt: number
    notes?: string
}

export interface SkillState {
    skill: SkillName
    /** null means genuinely not yet assessed in any way — never invented. */
    current: ProficiencyEstimate | null
    history: AssessmentResult[]
    strengths: string[]
    weaknesses: string[]
}

export interface SkillProfile {
    skills: Record<SkillName, SkillState>
    createdAt: number
    updatedAt: number
}

export function createDefaultSkillProfile(now = Date.now()): SkillProfile {
    const skills = {} as Record<SkillName, SkillState>

    for (const skill of SKILL_NAMES) {
        skills[skill] = {
            skill,
            current: null,
            history: [],
            strengths: [],
            weaknesses: [],
        }
    }

    return { skills, createdAt: now, updatedAt: now }
}
