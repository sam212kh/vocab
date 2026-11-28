<script setup lang="ts">
import { computed } from 'vue'
import AudioPlayer from './AudioPlayer.vue'
import HardWordButton from '../vocabulary/HardWordButton.vue'
import { getMeanings } from '../../services/vocabularyMeanings'
import type { Example, SynonymSense } from '../../types/vocabulary'
import type { HardWordSource } from '../../stores/hardWords'
import { useLocale } from '../../services/locale'

/**
 * The shared "what this word actually means" block — English word, part of
 * speech, every verified Persian meaning, and its real examples. Used after
 * reveal everywhere the app shows a vocabulary word (Review, Practice,
 * Daily Journey, Hard Words, Tap-to-Translate, ...) so fixing a gap here
 * fixes it everywhere at once, instead of per-screen.
 */
const props = withDefaults(defineProps<{
    word: string
    meaning: string
    pos?: string
    synonyms?: SynonymSense[]
    examples?: Example[]
    collocations?: string[]
    relatedExpressions?: string[]
    usage?: string
    showSave?: boolean
    source?: HardWordSource
    /** Word audio is optional — some callers (e.g. a prompt-only context) already show it elsewhere. */
    showAudio?: boolean
}>(), {
    pos: '',
    synonyms: () => [],
    examples: () => [],
    collocations: () => [],
    relatedExpressions: () => [],
    usage: '',
    showSave: true,
    showAudio: true,
})

/* Reactive — props.meaning/synonyms change when the caller advances to the next word while this component instance stays mounted (e.g. Hard Words "Next →"). A plain non-reactive const here would silently keep showing the previous word's meanings. */
const meanings = computed(() => getMeanings({ meaning: props.meaning, synonyms: props.synonyms }))
const { t } = useLocale()
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
            <h3 class="wrap-anywhere text-2xl font-bold text-gray-900" dir="ltr" lang="en">{{ word }}</h3>
            <span v-if="pos" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{{ pos }}</span>
            <AudioPlayer v-if="showAudio" :text="word" size="sm" :label="word" />
            <HardWordButton v-if="showSave" :word-id="word" :meaning="meaning" :meanings="meanings.map(entry => entry.text)" :source="source" />
        </div>

        <p class="fa-text text-lg text-gray-900" lang="fa">
            {{ meanings.length ? meanings.map(entry => entry.text).join(' - ') : meaning }}
        </p>

        <p v-if="usage" class="fa-text rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" lang="fa">
            {{ usage }}
        </p>

        <div v-if="collocations.length" class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('vocabulary.commonCollocations') }}</p>
            <div class="flex flex-wrap gap-2">
                <span v-for="item in collocations" :key="item" class="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-700">{{ item }}</span>
            </div>
        </div>

        <div v-if="relatedExpressions.length" class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('vocabulary.relatedExpressions') }}</p>
            <div class="flex flex-wrap gap-2">
                <span v-for="item in relatedExpressions" :key="item" class="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-700">{{ item }}</span>
            </div>
        </div>

        <details v-if="examples.length" class="group">
            <summary class="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium text-accent-ink select-none">
                <span class="transition group-open:rotate-90">›</span>
                <span>{{ t('vocabulary.examples') }}</span>
            </summary>
            <ul class="mt-2 space-y-3 border-t border-gray-100 pt-3">
                <li v-for="(example, index) in examples" :key="index">
                    <div class="flex items-start gap-2">
                        <p class="wrap-anywhere flex-1 text-sm text-gray-800" dir="ltr" lang="en">{{ example.english }}</p>
                        <AudioPlayer :text="example.english" size="sm" :label="example.english" />
                    </div>
                    <p class="fa-text wrap-anywhere mt-0.5 text-sm text-gray-500" lang="fa">{{ example.persian }}</p>
                </li>
            </ul>
        </details>
    </div>
</template>
