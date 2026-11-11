import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

export interface SessionSettings {
    /** When off, the Daily Session skips the speaking step after recall. */
    speakingEnabled: boolean
}

const STORAGE_KEY = 'english-upgrade-session-settings'

const STORAGE_VERSION = 1

function defaults(): SessionSettings {
    return {
        speakingEnabled: true,
    }
}

const repository = createVersionedRepository<SessionSettings>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: defaults,
    migrate: migrateStored,
})

export const useSessionSettingsStore = defineStore('sessionSettings', () => {
    const { value: initial } = repository.load()

    const settings = ref<SessionSettings>(initial)

    function toggleSpeaking() {
        settings.value = {
            ...settings.value,
            speakingEnabled: !settings.value.speakingEnabled,
        }

        repository.save(settings.value)
    }

    return {
        settings,
        toggleSpeaking,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): SessionSettings {
    const fallback = defaults()

    if (!raw || typeof raw !== 'object') {
        return fallback
    }

    const value = raw as Partial<SessionSettings>

    return {
        speakingEnabled:
            typeof value.speakingEnabled === 'boolean'
                ? value.speakingEnabled
                : fallback.speakingEnabled,
    }
}
