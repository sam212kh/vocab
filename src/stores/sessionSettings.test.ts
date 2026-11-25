import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSessionSettingsStore } from './sessionSettings'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('sessionSettings store', () => {
    it('defaults speaking to enabled, matching existing application behavior', () => {
        const store = useSessionSettingsStore()

        expect(store.settings.speakingEnabled).toBe(true)
    })

    it('toggleSpeaking flips the flag', () => {
        const store = useSessionSettingsStore()

        store.toggleSpeaking()
        expect(store.settings.speakingEnabled).toBe(false)

        store.toggleSpeaking()
        expect(store.settings.speakingEnabled).toBe(true)
    })

    it('persists the OFF state across store instances (survives reload)', () => {
        const first = useSessionSettingsStore()
        first.toggleSpeaking()
        expect(first.settings.speakingEnabled).toBe(false)

        setActivePinia(createPinia())
        const second = useSessionSettingsStore()

        expect(second.settings.speakingEnabled).toBe(false)
    })

    it('persists the ON state across store instances', () => {
        const first = useSessionSettingsStore()
        first.toggleSpeaking() // off
        first.toggleSpeaking() // back on

        setActivePinia(createPinia())
        const second = useSessionSettingsStore()

        expect(second.settings.speakingEnabled).toBe(true)
    })

    it('a fresh session (new store instance) does not reset a saved OFF preference', () => {
        const first = useSessionSettingsStore()
        first.toggleSpeaking()

        // Simulate starting a brand new review session elsewhere in the app.
        setActivePinia(createPinia())
        const session2 = useSessionSettingsStore()
        setActivePinia(createPinia())
        const session3 = useSessionSettingsStore()

        expect(session2.settings.speakingEnabled).toBe(false)
        expect(session3.settings.speakingEnabled).toBe(false)
    })

    it('sanitizes a corrupted stored value back to the default', () => {
        localStorage.setItem(
            'english-upgrade-session-settings',
            JSON.stringify({ __version: 1, data: { speakingEnabled: 'not-a-boolean' } })
        )

        const store = useSessionSettingsStore()

        expect(store.settings.speakingEnabled).toBe(true)
    })
})
