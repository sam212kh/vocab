<script setup lang="ts">
import { ref } from 'vue'

import AppIcon from './AppIcon.vue'

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
    <span class="inline-flex flex-col align-middle">
        <button
            type="button"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-accent-ink transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
            :aria-label="label && !/^[^\w]+$/.test(label) ? `Play: ${label}` : 'Play audio'"
            :disabled="playing"
            @click="handleClick"
        >
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft" :class="playing ? 'ring-4 ring-accent/25' : ''">
                <AppIcon name="volume" :size="17" />
            </span>
        </button>

        <span v-if="error" class="text-xs text-red-600" role="status">
            {{ getSpeechError() || 'Pronunciation audio is unavailable.' }}
        </span>
    </span>
</template>
