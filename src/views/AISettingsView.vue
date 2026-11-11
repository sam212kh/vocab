<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { fetchAIProviders } from '../services/aiClient'
import { useAISettingsStore } from '../stores/aiSettings'
import { useToastStore } from '../stores/toast'

import type { AIProvidersResponse, AIProviderStatus } from '../services/aiClient'

const aiSettingsStore = useAISettingsStore()
const toastStore = useToastStore()

const providersInfo = ref<AIProvidersResponse | null>(null)
const loadingProviders = ref(false)
const gatewayError = ref('')

const settings = computed(() => aiSettingsStore.settings)

const selectedProviderStatus = computed<AIProviderStatus | null>(() =>
    providersInfo.value?.providers.find(p => p.id === settings.value.provider) ?? null
)

const availableModels = computed(() => {
    const status = selectedProviderStatus.value
    if (!status) return []

    return status.models.length ? status.models : (status.defaultModel ? [status.defaultModel] : [])
})

async function refreshProviders(notify = false) {
    loadingProviders.value = true
    gatewayError.value = ''

    try {
        providersInfo.value = await fetchAIProviders()

        if (notify) {
            const status = selectedProviderStatus.value
            toastStore.push(
                status?.available
                    ? `${settings.value.provider} is reachable.`
                    : `${settings.value.provider}: ${status?.detail ?? 'not available'}`,
                status?.available ? 'success' : 'error'
            )
        }
    } catch (err) {
        providersInfo.value = null
        gatewayError.value = err instanceof Error ? err.message : 'AI service unreachable'
        if (notify) toastStore.push(gatewayError.value, 'error')
    } finally {
        loadingProviders.value = false
    }
}

function setProvider(provider: 'ollama' | 'cloud') {
    aiSettingsStore.update({ provider, model: '' })
}

onMounted(() => refreshProviders())
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-6">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">AI Settings</h1>
            <p class="mt-2 text-gray-500">
                Choose where AI feedback runs. Provider credentials live only on the server —
                nothing secret is stored in this browser.
            </p>
        </div>

        <!-- Gateway status -->
        <div v-if="gatewayError" class="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <p class="font-semibold">AI service is not reachable</p>
            <p class="mt-1">{{ gatewayError }}</p>
            <p class="mt-2 text-amber-700">
                Writing practice still works without AI — only the intelligent feedback is unavailable.
                Locally: <code class="rounded bg-amber-100 px-1">npm run start:ai</code>.
            </p>
        </div>

        <!-- Enable -->
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <label class="flex items-center justify-between">
                <div>
                    <p class="font-semibold text-gray-900">AI writing evaluation</p>
                    <p class="mt-1 text-sm text-gray-500">When off, Writing uses only the basic objective checks.</p>
                </div>
                <input
                    type="checkbox"
                    class="h-5 w-5"
                    :checked="settings.enabled"
                    @change="aiSettingsStore.update({ enabled: ($event.target as HTMLInputElement).checked })"
                />
            </label>
        </section>

        <!-- Provider -->
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Provider</h2>
                <button
                    type="button"
                    class="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    :disabled="loadingProviders"
                    @click="refreshProviders(true)"
                >
                    {{ loadingProviders ? 'Testing...' : 'Test connection' }}
                </button>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                    v-for="provider in (providersInfo?.providers ?? [{ id: 'ollama' }, { id: 'cloud' }] as AIProviderStatus[])"
                    :key="provider.id"
                    type="button"
                    class="rounded-xl border p-4 text-left transition"
                    :class="settings.provider === provider.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 hover:bg-gray-50'"
                    @click="setProvider(provider.id)"
                >
                    <div class="flex items-center justify-between">
                        <p class="font-semibold">
                            {{ provider.id === 'ollama' ? 'Local (Ollama)' : 'Cloud API' }}
                        </p>
                        <span
                            v-if="providersInfo"
                            class="rounded-full px-2 py-0.5 text-xs"
                            :class="provider.available
                                ? 'bg-green-100 text-green-700'
                                : provider.configured ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'"
                        >
                            {{ provider.available ? 'available' : provider.configured ? 'unavailable' : 'not configured' }}
                        </span>
                    </div>
                    <p
                        class="mt-1 text-xs"
                        :class="settings.provider === provider.id ? 'text-gray-300' : 'text-gray-400'"
                    >
                        {{ provider.id === 'ollama'
                            ? 'Your text stays on your own machine.'
                            : 'Your text is sent to the configured cloud API.' }}
                    </p>
                </button>
            </div>

            <p
                v-if="selectedProviderStatus && !selectedProviderStatus.available"
                class="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600"
            >
                {{ selectedProviderStatus.configured
                    ? selectedProviderStatus.detail ?? 'The provider is configured but not responding.'
                    : selectedProviderStatus.id === 'cloud'
                        ? 'Cloud is not configured on the server. Set CLOUD_API_BASE_URL, CLOUD_API_KEY and CLOUD_MODEL in the AI service environment.'
                        : 'Ollama is not configured on the server. Set OLLAMA_MODEL in the AI service environment.' }}
            </p>

            <!-- Model -->
            <label class="mt-4 block text-sm">
                <span class="mb-1 block font-medium text-gray-700">Model</span>
                <select
                    class="w-full rounded-lg border px-3 py-2 sm:w-80"
                    :value="settings.model"
                    @change="aiSettingsStore.update({ model: ($event.target as HTMLSelectElement).value })"
                >
                    <option value="">Server default{{ selectedProviderStatus?.defaultModel ? ` (${selectedProviderStatus.defaultModel})` : '' }}</option>
                    <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
                </select>
            </label>

            <!-- Fallback -->
            <label v-if="providersInfo?.fallbackProvider" class="mt-4 flex items-start gap-3 text-sm">
                <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4"
                    :checked="settings.allowFallback"
                    @change="aiSettingsStore.update({ allowFallback: ($event.target as HTMLInputElement).checked })"
                />
                <span class="text-gray-600">
                    If {{ settings.provider }} fails, allow evaluation via
                    <strong>{{ providersInfo.fallbackProvider }}</strong>.
                    Your text will be sent to that provider — you'll be told when this happens.
                </span>
            </label>
        </section>

        <!-- Feedback preferences -->
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Feedback preferences</h2>

            <label class="mt-4 block text-sm">
                <span class="mb-1 block font-medium text-gray-700">Explanation language</span>
                <select
                    class="w-full rounded-lg border px-3 py-2 sm:w-80"
                    :value="settings.explanationLanguage"
                    @change="aiSettingsStore.update({ explanationLanguage: ($event.target as HTMLSelectElement).value as 'persian' | 'english' | 'follow-profile' })"
                >
                    <option value="follow-profile">Follow learner profile</option>
                    <option value="persian">Persian</option>
                    <option value="english">English</option>
                </select>
            </label>

            <label class="mt-4 block text-sm">
                <span class="mb-1 block font-medium text-gray-700">Feedback detail</span>
                <select
                    class="w-full rounded-lg border px-3 py-2 sm:w-80"
                    :value="settings.feedbackDetail"
                    @change="aiSettingsStore.update({ feedbackDetail: ($event.target as HTMLSelectElement).value as 'concise' | 'standard' | 'detailed' })"
                >
                    <option value="concise">Concise</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                </select>
            </label>
        </section>
    </div>
</template>
