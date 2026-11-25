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
        expect(store.profile.onboardingCompletedAt).toBeNull()
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
                    studyDurationMinutes: 999, // invalid, not one of 5/10/15/20/30/45/60
                    goals: [{ type: 'not-a-real-goal', priority: 1 }],
                },
            })
        )

        const store = useLearnerProfileStore()

        expect(store.profile.nativeLanguage).toBe('French')
        expect(store.profile.studyDurationMinutes).toBe(45)
        expect(store.profile.goals.length).toBeGreaterThan(0)
        expect(store.profile.onboardingCompletedAt).toBeNull()
    })

    it('accepts every duration in the expanded onboarding range (5-60 min)', () => {
        for (const minutes of [5, 10, 15, 20, 30, 45, 60] as const) {
            setActivePinia(createPinia())
            localStorage.clear()

            const store = useLearnerProfileStore()
            store.update({ studyDurationMinutes: minutes })

            expect(store.profile.studyDurationMinutes).toBe(minutes)
        }
    })

    it('completing onboarding sets onboardingCompletedAt and it survives reload', () => {
        const first = useLearnerProfileStore()
        first.update({ onboardingCompletedAt: Date.now() })

        setActivePinia(createPinia())
        const second = useLearnerProfileStore()

        expect(second.profile.onboardingCompletedAt).not.toBeNull()
    })

    it('resetToDefaults() restores the default profile', () => {
        const store = useLearnerProfileStore()
        store.update({ nativeLanguage: 'German' })

        store.resetToDefaults()

        expect(store.profile.nativeLanguage).toBe('Persian')
    })
})
