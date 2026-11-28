<script setup lang="ts">
import { computed } from 'vue'
import { pickReviewPrompt } from '../../services/vocabularyMeanings'
import type { Word } from '../../types/vocabulary'

/**
 * The "before reveal" recall prompt: the Persian meaning the learner must
 * produce the English word for. When this word's bare meaning is shared by
 * another word in the current pool (obtain/achieve/acquire/gain all gloss
 * close to "به دست آوردن"), a real example from this word's own data is
 * shown as a smaller supporting line so the prompt isn't ambiguous between
 * several equally-valid English answers — never a fabricated phrase.
 */
const props = defineProps<{
    word: Word
    /** Every word the learner could currently be asked about, for ambiguity detection. Pass just [word] when unknown. */
    pool: readonly Word[]
}>()

const prompt = computed(() => pickReviewPrompt(props.word, props.pool))
</script>

<template>
    <div>
        <p class="fa-text wrap-anywhere text-lg text-gray-900" lang="fa">{{ prompt.meanings.join(' - ') }}</p>
        <p v-if="prompt.isAmbiguous && prompt.contextExample" class="fa-text mt-1.5 text-sm text-gray-400" lang="fa">
            {{ prompt.contextExample.persian }}
        </p>
    </div>
</template>
