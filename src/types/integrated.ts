import type { SkillName } from './skillProfile'

export interface IntegratedSource {
    skill: SkillName
    id: string
    title: string
    cefrLevel?: string
}

/** A topic hand-off assembled from authored content in existing modules. */
export interface IntegratedUnit {
    id: string
    title: string
    titlePersian: string
    cefrLevel?: string
    objective: string
    objectivePersian?: string
    sources: IntegratedSource[]
    skills: SkillName[]
}
