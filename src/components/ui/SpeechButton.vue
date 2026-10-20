<script setup lang="ts">
import { ref } from 'vue'

import {
    speakAsync,
    getSpeechError,
    getSpeechRate,
    isLanguageSupported,
} from '../../services/speech'

import {
    playPersianPronunciation,
} from '../../services/persianPronunciation'

const props = withDefaults(
    defineProps<{
        text: string
        lang?: 'en-US' | 'fa-IR'
        label?: string
    }>(),
    {
        lang: 'en-US',
    }
)

const playing = ref(false)
const error = ref(false)

async function handleClick() {
    if (!props.text.trim()) {
        return
    }

    error.value = false
    playing.value = true

    try {
        if (props.lang === 'fa-IR') {
            await playPersianPronunciation(
                props.text
            )

            return
        }

        if (!isLanguageSupported(props.lang)) {
            error.value = true
            return
        }

        const success = await speakAsync(
            props.text,
            props.lang,
            { rate: getSpeechRate() }
        )
        error.value = !success
        if (!success) {
            console.warn('[TTS]', getSpeechError())
        }
    } catch (err) {
        console.error(
            'Pronunciation error:',
            err
        )

        error.value = true
    } finally {
        playing.value = false
    }
}
</script>

<template>
    <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="playing"
        @click="handleClick"
    >
        <span v-if="playing">
            🔊
        </span>

        <span v-else>
            🔊
        </span>
    </button>

    <p
        v-if="error"
        class="mt-1 text-xs text-red-500"
    >
        {{ getSpeechError() || 'Pronunciation audio is unavailable.' }}
    </p>
</template>
