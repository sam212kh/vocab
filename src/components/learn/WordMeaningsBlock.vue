<script setup lang="ts">
import AudioPlayer from './AudioPlayer.vue'
import { getMeanings } from '../../services/vocabularyMeanings'
import type { Example, SynonymSense } from '../../types/vocabulary'

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
    /** Word audio is optional — some callers (e.g. a prompt-only context) already show it elsewhere. */
    showAudio?: boolean
}>(), {
    pos: '',
    synonyms: () => [],
    examples: () => [],
    showAudio: true,
})

const meanings = getMeanings({ meaning: props.meaning, synonyms: props.synonyms })
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
            <h3 class="wrap-anywhere text-2xl font-bold text-gray-900" dir="ltr" lang="en">{{ word }}</h3>
            <span v-if="pos" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{{ pos }}</span>
            <AudioPlayer v-if="showAudio" :text="word" size="sm" :label="word" />
        </div>

        <p v-if="meanings.length <= 1" class="fa-text text-lg text-gray-900" lang="fa">
            {{ meanings[0]?.text ?? meaning }}
        </p>
        <ol v-else class="fa-text list-inside list-decimal space-y-0.5 text-lg text-gray-900" lang="fa">
            <li v-for="entry in meanings" :key="entry.text">{{ entry.text }}</li>
        </ol>

        <details v-if="examples.length" class="group">
            <summary class="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium text-accent-ink select-none">
                <span class="transition group-open:rotate-90">›</span>
                <span>Examples</span>
            </summary>
            <ul class="mt-2 space-y-3 border-t border-gray-100 pt-3">
                <li v-for="(example, index) in examples" :key="index">
                    <p class="wrap-anywhere text-sm text-gray-800" dir="ltr" lang="en">{{ example.english }}</p>
                    <p class="fa-text wrap-anywhere mt-0.5 text-sm text-gray-500" lang="fa">{{ example.persian }}</p>
                </li>
            </ul>
        </details>
    </div>
</template>
