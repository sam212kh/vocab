<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
    getSpeechProvider,
    getSpeechRate,
    getSpeechVoice,
    getSpeechVoices,
    loadSpeechVoices,
    setSpeechProvider,
    setSpeechRate,
    setSpeechVoice,
} from '../../services/speech'
import type { SpeechRate } from '../../services/speech'

const route = useRoute()
const mobileOpen = ref(false)
const speechProvider = ref(getSpeechProvider())
watch(speechProvider, setSpeechProvider)
const speechRate = ref<SpeechRate>(getSpeechRate())
watch(speechRate, setSpeechRate)
const speechVoice = ref(getSpeechVoice())
const speechVoices = ref(getSpeechVoices())
watch(speechVoice, setSpeechVoice)
onMounted(async () => {
    speechVoices.value = await loadSpeechVoices()
    if (!speechVoices.value.some(voice => voice.id === speechVoice.value)) {
        speechVoice.value = speechVoices.value[0]?.id ?? speechVoice.value
    }
})

const menuItems = [
    { label: 'Dashboard', icon: '🏠', route: '/' },
    { label: 'Lessons', icon: '📚', route: '/lessons' },
    { label: 'Learn', icon: '📖', route: '/learn' },
    { label: 'Practice', icon: '✍️', route: '/practice' },
    { label: 'Quiz', icon: '🧠', route: '/quiz' },
    { label: 'Listen & Repeat', icon: '🔊', route: '/listen-repeat' },
    { label: 'Hard Words', icon: '⭐', route: '/hard-words' },
    { label: 'Speaking Practice', icon: '🎙️', route: '/speaking-practice' },
    { label: 'Review', icon: '🔁', route: '/review' },
]

function isActive(path: string) {
    if (path === '/') return route.path === '/'
    return route.path === path || route.path.startsWith(`${path}/`)
}

function closeMobile() {
    mobileOpen.value = false
}
</script>

<template>
    <button
        type="button"
        class="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border bg-white shadow md:hidden"
        aria-label="Open menu"
        @click="mobileOpen = true"
    >
        ☰
    </button>

    <div
        v-if="mobileOpen"
        class="fixed inset-0 z-40 bg-black/30 md:hidden"
        @click="closeMobile"
    />

    <aside
        class="fixed inset-y-0 left-0 z-50 w-64 -translate-x-full border-r bg-white p-4 shadow-xl transition-transform md:sticky md:top-0 md:flex md:h-screen md:translate-x-0 md:shrink-0 md:shadow-none"
        :class="{ 'translate-x-0': mobileOpen }"
    >
        <div class="flex w-full flex-col">
            <div class="mb-6 flex items-center justify-between">
                <div>
                    <h2 class="text-xl font-bold text-gray-900">
                        English Upgrade
                    </h2>
                    <p class="mt-1 text-xs text-gray-500">
                        Learn · Practice · Speak
                    </p>
                </div>

                <button
                    type="button"
                    class="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 md:hidden"
                    @click="closeMobile"
                >
                    ✕
                </button>
            </div>

            <nav class="space-y-1">
                <RouterLink
                    v-for="item in menuItems"
                    :key="item.route"
                    :to="item.route"
                    class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition hover:bg-gray-100"
                    :class="{
                        'bg-gray-900 text-white hover:bg-gray-900':
                            isActive(item.route),
                    }"
                    @click="closeMobile"
                >
                    <span>{{ item.icon }}</span>
                    <span>{{ item.label }}</span>
                </RouterLink>
            </nav>

            <div class="mt-6 border-t pt-4">
                <label for="speech-provider" class="mb-2 block text-xs font-medium text-gray-600">
                    Pronunciation voice
                </label>
                <select
                    id="speech-provider"
                    v-model="speechProvider"
                    class="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                    <option value="automatic">Automatic</option>
                    <option value="neural">Neural Voice</option>
                    <option value="system">System Voice</option>
                </select>

                <label for="speech-voice" class="mb-2 mt-4 block text-xs font-medium text-gray-600">
                    Voice
                </label>
                <select
                    id="speech-voice"
                    v-model="speechVoice"
                    class="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                    <option
                        v-for="voice in speechVoices"
                        :key="voice.id"
                        :value="voice.id"
                    >
                        {{ voice.label }}
                    </option>
                </select>

                <label for="speech-rate" class="mb-2 mt-4 block text-xs font-medium text-gray-600">
                    Speech speed
                </label>
                <select
                    id="speech-rate"
                    v-model="speechRate"
                    class="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                    <option :value="0.6">Very slow</option>
                    <option :value="0.75">Slow</option>
                    <option :value="0.9">Normal</option>
                    <option :value="1">Fast</option>
                    <option :value="1.15">Very fast</option>
                    <option :value="1.3">Extra fast</option>
                </select>
            </div>
        </div>
    </aside>
</template>
