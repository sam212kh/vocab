<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import AppIcon from '../ui/AppIcon.vue'

import { getSpeechError, getSpeechRate, isLanguageSupported, speakAsync, stop } from '../../services/speech'
import { playPersianPronunciation } from '../../services/persianPronunciation'

/**
 * One calm audio control. Uses the app's existing speech settings and
 * engines (system / neural TTS, saved rate, pre-recorded Persian audio);
 * "slow" is the same engine at the slowest supported rate.
 */
const props = withDefaults(defineProps<{
    text: string
    lang?: 'en-US' | 'fa-IR'
    /** lg: lesson hero · md: comfortable default · sm: inline beside a sentence */
    size?: 'lg' | 'md' | 'sm'
    label?: string
    /** Offer a slow replay (English only). */
    slow?: boolean
    /** Show the text label beside the button (always on for lg). */
    showLabel?: boolean
    /** Compact bordered pill (secondary audio such as Persian pronunciation). */
    pill?: boolean
    tone?: 'learn' | 'practice'
}>(), { lang: 'en-US', size: 'md', tone: 'learn' })

const playing = ref<'normal' | 'slow' | null>(null)
const failed = ref('')

const SLOW_RATE = 0.6

async function play(mode: 'normal' | 'slow') {
    if (!props.text.trim()) return

    if (playing.value) {
        stop()
        const wasSame = playing.value === mode
        playing.value = null
        if (wasSame) return
    }

    failed.value = ''
    playing.value = mode

    try {
        if (props.lang === 'fa-IR') {
            await playPersianPronunciation(props.text)
            return
        }

        if (!isLanguageSupported(props.lang)) {
            failed.value = 'Audio is not available in this browser.'
            return
        }

        const ok = await speakAsync(props.text, props.lang, { rate: mode === 'slow' ? SLOW_RATE : getSpeechRate() })

        if (!ok && playing.value === mode) failed.value = getSpeechError() || 'Audio is unavailable right now.'
    } catch {
        failed.value = 'Audio is unavailable right now.'
    } finally {
        if (playing.value === mode) playing.value = null
    }
}

onBeforeUnmount(() => {
    if (playing.value) stop()
})

const accent = {
    learn: { solid: 'bg-learn-600 text-white hover:bg-learn-700', soft: 'bg-learn-50 text-learn-700 hover:bg-learn-100', ring: 'ring-learn-500/40' },
    practice: { solid: 'bg-practice-600 text-white hover:bg-practice-700', soft: 'bg-practice-50 text-practice-700 hover:bg-practice-100', ring: 'ring-practice-500/40' },
}[props.tone]
</script>

<template>
    <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <!-- Secondary pill (e.g. Persian pronunciation) -->
        <button
            v-if="pill"
            type="button"
            class="motion-safe-only inline-flex min-h-11 items-center text-sm font-medium text-ink-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-4"
            :class="accent.ring"
            :aria-label="playing === 'normal' ? 'Stop audio' : `Play audio${label ? `: ${label}` : ''}`"
            :aria-pressed="playing === 'normal'"
            @click="play('normal')"
        >
            <span class="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5" :class="playing === 'normal' ? 'border-learn-500 text-learn-700' : ''">
                <AppIcon :name="playing === 'normal' ? 'stop' : 'volume'" :size="15" />
                {{ label }}
            </span>
        </button>

        <!-- Primary control. The hit area is always 44px; only the visible disc scales. -->
        <button
            v-else
            type="button"
            class="group inline-flex min-h-11 min-w-11 items-center justify-center gap-3 rounded-full focus-visible:outline-none"
            :class="size === 'lg' || showLabel ? 'pr-3' : ''"
            :aria-label="playing === 'normal' ? 'Stop audio' : `Play audio${label ? `: ${label}` : ''}`"
            :aria-pressed="playing === 'normal'"
            @click="play('normal')"
        >
            <span
                class="motion-safe-only flex items-center justify-center rounded-full transition group-focus-visible:ring-4"
                :class="[
                    size === 'lg' ? `h-12 w-12 ${accent.solid}` : size === 'md' ? `h-10 w-10 ${accent.soft}` : `h-8 w-8 ${accent.soft}`,
                    accent.ring,
                    playing === 'normal' ? 'ring-4' : '',
                ]"
            >
                <AppIcon :name="playing === 'normal' ? 'stop' : 'volume'" :size="size === 'lg' ? 22 : size === 'md' ? 19 : 16" />
            </span>
            <span v-if="size === 'lg' || showLabel" class="text-sm font-medium text-ink-soft max-[399px]:sr-only">
                {{ playing === 'normal' ? 'Playing…' : (label ?? 'Listen') }}
            </span>
        </button>

        <button
            v-if="slow && lang === 'en-US'"
            type="button"
            class="motion-safe-only inline-flex min-h-11 items-center rounded-full px-1 text-sm font-medium text-ink-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-4"
            :class="[accent.ring, playing === 'slow' ? 'text-ink' : '']"
            :aria-label="playing === 'slow' ? 'Stop slow audio' : 'Play audio slowly'"
            @click="play('slow')"
        >
            <span class="rounded-full border border-line bg-white px-3 py-1.5" :class="playing === 'slow' ? 'border-learn-500 text-learn-700' : ''">
                {{ playing === 'slow' ? 'Playing slowly…' : 'Slow' }}
            </span>
        </button>

        <span v-if="failed" class="basis-full text-xs text-bad-600" role="status">{{ failed }}</span>
    </span>
</template>
