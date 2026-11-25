<script setup lang="ts">
import { ref, watch } from 'vue'

import AppIcon from '../ui/AppIcon.vue'
import AudioPlayer from './AudioPlayer.vue'
import ContextualExample from './ContextualExample.vue'
import UsageNote from './UsageNote.vue'

import type { LearnItem, LexiconEntry } from '../../services/learnItems'

/**
 * One expression, presented to be understood: the expression itself in
 * prominent type, its Persian meaning, audio, then an example in context and
 * (only when the content has them) usage guidance. Everything is visible —
 * there is nothing to answer here.
 */
const props = defineProps<{
    item: LearnItem
    index: number
    total: number
    lexicon: LexiconEntry[]
    saved: boolean
    saveLabel: string
    /** Offer the pre-recorded Persian pronunciation (vocabulary words only). */
    persianAudio?: boolean
}>()

const emit = defineEmits<{ save: []; lookup: [entry: LexiconEntry] }>()

const showAllExamples = ref(false)

watch(() => props.item.id, () => { showAllExamples.value = false })
</script>

<template>
    <article class="overflow-hidden rounded-3xl border border-line bg-white shadow-soft" :aria-label="`Expression ${index + 1} of ${total}`">
        <!-- Hero: the expression, its meaning, its sound -->
        <header class="bg-learn-50 px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
            <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-learn-700">
                    <span class="font-semibold uppercase tracking-[0.1em]">{{ index + 1 }} of {{ total }}</span>
                    <span v-if="item.pos" class="rounded-full bg-white/70 px-2.5 py-0.5">{{ item.pos }}</span>
                    <span v-if="item.level" class="rounded-full bg-white/70 px-2.5 py-0.5">{{ item.level }}</span>
                </div>

                <button
                    type="button"
                    class="motion-safe-only -mr-2 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/40"
                    :class="saved ? 'text-learn-700' : 'text-ink-soft hover:text-ink'"
                    :aria-pressed="saved"
                    :aria-label="saved ? `Remove from ${saveLabel}` : `Save to ${saveLabel}`"
                    @click="emit('save')"
                >
                    <AppIcon :name="saved ? 'bookmark-fill' : 'bookmark'" :size="19" />
                    <span class="hidden sm:inline">{{ saved ? 'Saved' : 'Save' }}</span>
                </button>
            </div>

            <h2
                class="font-display wrap-anywhere mt-4 text-[2.15rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl"
                dir="ltr"
                lang="en"
            >
                {{ item.text }}
            </h2>

            <p class="fa-text wrap-anywhere mt-3 text-[1.35rem] text-ink sm:text-2xl" lang="fa">
                {{ item.meaning }}
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                <AudioPlayer :text="item.text" size="lg" slow label="Listen" />
                <AudioPlayer v-if="persianAudio" :text="item.meaning" lang="fa-IR" pill label="Persian" />
            </div>

            <p v-if="item.synonyms.length" class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-soft">
                <span class="text-xs uppercase tracking-[0.08em] text-ink-faint" dir="ltr">Also</span>
                <span v-for="synonym in item.synonyms" :key="synonym.word" class="rounded-full border border-learn-200/70 bg-white/70 px-2.5 py-0.5" dir="ltr">
                    <span lang="en">{{ synonym.word }}</span><template v-if="synonym.meaning"> · <span class="fa-text" lang="fa">{{ synonym.meaning }}</span></template>
                </span>
            </p>
        </header>

        <!-- Body: language in use -->
        <div class="space-y-6 px-5 py-6 sm:px-8 sm:py-7">
            <section v-if="item.examples.length" aria-label="Example">
                <h3 class="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">Example</h3>
                <ContextualExample
                    :english="item.examples[0].english"
                    :persian="item.examples[0].persian"
                    :lexicon="lexicon"
                    :current-index="index"
                    @lookup="entry => emit('lookup', entry)"
                />

                <template v-if="item.examples.length > 1">
                    <div v-if="showAllExamples" class="mt-4 space-y-4 border-t border-line pt-4">
                        <ContextualExample
                            v-for="example in item.examples.slice(1)"
                            :key="example.english"
                            :english="example.english"
                            :persian="example.persian"
                            :lexicon="lexicon"
                            :current-index="index"
                            @lookup="entry => emit('lookup', entry)"
                        />
                    </div>
                    <button
                        type="button"
                        class="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm font-medium text-learn-700 hover:text-learn-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
                        :aria-expanded="showAllExamples"
                        @click="showAllExamples = !showAllExamples"
                    >
                        <AppIcon :name="showAllExamples ? 'close' : 'plus'" :size="16" />
                        {{ showAllExamples ? 'Show fewer examples' : `${item.examples.length - 1} more example${item.examples.length > 2 ? 's' : ''}` }}
                    </button>
                </template>
            </section>

            <section v-if="item.context" aria-label="In context">
                <h3 class="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">In context</h3>
                <ContextualExample :english="item.context" :lexicon="lexicon" :current-index="index" quiet @lookup="entry => emit('lookup', entry)" />
            </section>

            <UsageNote :note="item.usage" :mistakes="item.mistakes" />
        </div>
    </article>
</template>
