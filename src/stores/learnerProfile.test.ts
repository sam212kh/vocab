import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLearnerProfileStore } from './learnerProfile'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('learnerProfile store', () => {
    it('starts with the documented defaults for a brand new learner', () => {
        const store = useLearnerProfileStore()

        expect(store.profile.nativeLanguage).toBe('Persian')
        expect(store.profile.targetLanguage).toBe('English')
        expect(store.profile.studyDurationMinutes).toBe(45)
        expect(store.profile.goals.map(g => g.type)).toEqual([
            'speaking',
            'listening',
            'professional-english',
        ])
        expect(store.profile.selfReportedLevel).toBe('B1')
        expect(store.profile.selectedProgramId).toBeNull()
    })

    it('update() merges a partial patch and bumps updatedAt', () => {
        const store = useLearnerProfileStore()
        const before = store.profile.updatedAt

        store.update({ studyDurationMinutes: 30 })

        expect(store.profile.studyDurationMinutes).toBe(30)
        expect(store.profile.nativeLanguage).toBe('Persian')
        expect(store.profile.updatedAt).toBeGreaterThanOrEqual(before)
    })

    it('persists updates across store instances', () => {
        const first = useLearnerProfileStore()
        first.update({ nativeLanguage: 'Spanish', studyDurationMinutes: 60 })

        setActivePinia(createPinia())
        const second = useLearnerProfileStore()

        expect(second.profile.nativeLanguage).toBe('Spanish')
        expect(second.profile.studyDurationMinutes).toBe(60)
    })

    it('sanitizes a corrupted/partial stored profile back to safe defaults per-field', () => {
        localStorage.setItem(
            'english-upgrade-learner-profile',
            JSON.stringify({
                __version: 1,
                data: {
                    nativeLanguage: 'French',
                    studyDurationMinutes: 999, // invalid, not one of 15/30/45/60
                    goals: [{ type: 'not-a-real-goal', priority: 1 }],
                },
            })
        )

        const store = useLearnerProfileStore()

        expect(store.profile.nativeLanguage).toBe('French')
        expect(store.profile.studyDurationMinutes).toBe(45)
        expect(store.profile.goals.length).toBeGreaterThan(0)
    })

    it('resetToDefaults() restores the default profile', () => {
        const store = useLearnerProfileStore()
        store.update({ nativeLanguage: 'German' })

        store.resetToDefaults()

        expect(store.profile.nativeLanguage).toBe('Persian')
    })
})
