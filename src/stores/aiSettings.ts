import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

/**
 * Safe user preferences only — provider choice, model name, languages,
 * detail level. API keys and provider credentials live exclusively in the
 * AI gateway's server environment and are never stored here.
 */

export type AIProviderId = 'ollama' | 'cloud'

export type AIExplanationLanguage = 'persian' | 'english' | 'follow-profile'

export type AIFeedbackDetail = 'concise' | 'standard' | 'detailed'

export interface AISettings {
    enabled: boolean
    provider: AIProviderId
    /** Empty string = use the server's default model for the provider. */
    model: string
    explanationLanguage: AIExplanationLanguage
    feedbackDetail: AIFeedbackDetail
    /**
     * Allow the gateway's configured fallback provider when the chosen one
     * fails. Off by default: the learner's text is never sent to a provider
     * they did not pick unless they opted in.
     */
    allowFallback: boolean
}

const STORAGE_KEY = 'english-upgrade-ai-settings'

const STORAGE_VERSION = 1

function defaults(): AISettings {
    return {
        enabled: true,
        provider: 'ollama',
        model: '',
        explanationLanguage: 'follow-profile',
        feedbackDetail: 'standard',
        allowFallback: false,
    }
}

const repository = createVersionedRepository<AISettings>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: defaults,
    migrate: migrateStored,
})

export const useAISettingsStore = defineStore('aiSettings', () => {
    const { value: initial } = repository.load()

    const settings = ref<AISettings>(initial)

    function update(patch: Partial<AISettings>) {
        settings.value = { ...settings.value, ...patch }
        repository.save(settings.value)
    }

    return {
        settings,
        update,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): AISettings {
    const fallback = defaults()

    if (!raw || typeof raw !== 'object') {
        return fallback
    }

    const value = raw as Partial<AISettings>

    return {
        enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
        provider: value.provider === 'cloud' ? 'cloud' : 'ollama',
        model: typeof value.model === 'string' ? value.model : '',
        explanationLanguage:
            value.explanationLanguage === 'persian' || value.explanationLanguage === 'english'
                ? value.explanationLanguage
                : 'follow-profile',
        feedbackDetail:
            value.feedbackDetail === 'concise' || value.feedbackDetail === 'detailed'
                ? value.feedbackDetail
                : 'standard',
        allowFallback: value.allowFallback === true,
    }
}
