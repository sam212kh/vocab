import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSkillProfileStore } from './skillProfile'
import { SKILL_NAMES } from '../types/skillProfile'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('skillProfile store', () => {
    it('starts with every skill unassessed — no invented scores', () => {
        const store = useSkillProfileStore()

        for (const skill of SKILL_NAMES) {
            expect(store.profile.skills[skill].current).toBeNull()
            expect(store.profile.skills[skill].history).toEqual([])
        }
    })

    it('self-reporting one skill does not change any other skill', () => {
        const store = useSkillProfileStore()

        store.selfReportLevel('speaking', 'B2')

        expect(store.profile.skills.speaking.current?.level).toBe('B2')
        expect(store.profile.skills.speaking.current?.source).toBe('self-reported')

        for (const skill of SKILL_NAMES) {
            if (skill === 'speaking') continue
            expect(store.profile.skills[skill].current).toBeNull()
        }
    })

    it('skills can independently hold different CEFR levels', () => {
        const store = useSkillProfileStore()

        store.selfReportLevel('vocabulary', 'B2')
        store.selfReportLevel('speaking', 'A2')
        store.selfReportLevel('writing', 'C1')

        expect(store.profile.skills.vocabulary.current?.level).toBe('B2')
        expect(store.profile.skills.speaking.current?.level).toBe('A2')
        expect(store.profile.skills.writing.current?.level).toBe('C1')
    })

    it('records every self-report in that skill\'s history', () => {
        const store = useSkillProfileStore()

        store.selfReportLevel('listening', 'A2')
        store.selfReportLevel('listening', 'B1')

        expect(store.profile.skills.listening.history).toHaveLength(2)
        expect(store.profile.skills.listening.current?.level).toBe('B1')
    })

    it('persists across store instances', () => {
        const first = useSkillProfileStore()
        first.selfReportLevel('reading', 'B2')

        setActivePinia(createPinia())
        const second = useSkillProfileStore()

        expect(second.profile.skills.reading.current?.level).toBe('B2')
    })
})
