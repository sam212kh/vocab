<script setup lang="ts">
import { computed } from 'vue'

import AudioPlayer from './AudioPlayer.vue'

import { tokenizeWithLexicon } from '../../services/learnItems'
import type { LexiconEntry } from '../../services/learnItems'

/**
 * A sentence in context: English (LTR) with the target expression
 * highlighted and every other lesson word tappable, then its Persian
 * translation (RTL). Direction is set per language, never inherited.
 */
const props = defineProps<{
    english: string
    persian?: string
    lexicon: LexiconEntry[]
    /** Index of the expression being studied (highlighted, not a link-out). */
    currentIndex: number
    /** Compact "in context" passage: no translation row, smaller audio. */
    quiet?: boolean
}>()

const emit = defineEmits<{ lookup: [entry: LexiconEntry] }>()

const tokens = computed(() => tokenizeWithLexicon(props.english, props.lexicon))
</script>

<template>
    <div>
        <div class="flex items-start gap-2">
            <p
                class="wrap-anywhere min-w-0 flex-1 text-[1.0625rem] leading-8 text-ink sm:text-lg sm:leading-9"
                dir="ltr"
                lang="en"
            >
                <template v-for="(token, index) in tokens" :key="index">
                    <button
                        v-if="token.entry"
                        type="button"
                        class="motion-safe-only rounded px-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-learn-500"
                        :class="token.entry.itemIndex === currentIndex
                            ? 'bg-learn-100 font-semibold text-learn-900'
                            : 'underline decoration-ink-faint decoration-dotted underline-offset-4 hover:bg-paper-deep'"
                        :aria-label="`Meaning of ${token.text}`"
                        @click="emit('lookup', token.entry)"
                    >{{ token.text }}</button>
                    <template v-else>{{ token.text }}</template>
                </template>
            </p>
            <AudioPlayer :text="english" size="sm" :label="english" class="-mr-1 shrink-0" />
        </div>

        <p
            v-if="persian && !quiet"
            class="fa-text wrap-anywhere mt-1 border-r-2 border-line pr-3 text-[0.98rem] text-ink-soft"
            lang="fa"
        >
            {{ persian }}
        </p>
    </div>
</template>
