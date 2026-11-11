import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAISettingsStore } from './aiSettings'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('aiSettings store', () => {
    it('starts with safe defaults: local provider, fallback off', () => {
        const store = useAISettingsStore()

        expect(store.settings.provider).toBe('ollama')
        expect(store.settings.allowFallback).toBe(false)
        expect(store.settings.explanationLanguage).toBe('follow-profile')
        expect(store.settings.feedbackDetail).toBe('standard')
    })

    it('persists preference updates across instances', () => {
        const first = useAISettingsStore()
        first.update({ provider: 'cloud', feedbackDetail: 'detailed', allowFallback: true })

        setActivePinia(createPinia())
        const second = useAISettingsStore()

        expect(second.settings.provider).toBe('cloud')
        expect(second.settings.feedbackDetail).toBe('detailed')
        expect(second.settings.allowFallback).toBe(true)
    })

    it('sanitizes corrupted stored values back to safe defaults', () => {
        localStorage.setItem(
            'english-upgrade-ai-settings',
            JSON.stringify({
                __version: 1,
                data: { provider: 'secret-vendor', feedbackDetail: 'enormous', apiKey: 'should-never-exist' },
            })
        )

        const store = useAISettingsStore()

        expect(store.settings.provider).toBe('ollama')
        expect(store.settings.feedbackDetail).toBe('standard')
        expect('apiKey' in store.settings).toBe(false)
    })

    it('never persists anything that looks like a credential', () => {
        const store = useAISettingsStore()
        store.update({ model: 'qwen2.5:7b-instruct' })

        const raw = localStorage.getItem('english-upgrade-ai-settings')!

        expect(raw).not.toMatch(/key|token|secret|bearer/i)
    })
})
