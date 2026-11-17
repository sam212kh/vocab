<script setup lang="ts">
import type { TransferLearn } from '../../types/transfer'

defineProps<{ learn: TransferLearn }>()
</script>

<template>
    <section class="mt-4 rounded-2xl bg-gray-50 p-4 text-sm" data-testid="transfer-insight" aria-label="About this pattern">
        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">About this pattern</p>
        <p class="mt-1 font-semibold text-gray-900" dir="ltr" lang="en">{{ learn.frame }}</p>

        <p v-if="learn.explanation" class="mt-2 text-gray-700">{{ learn.explanation }}</p>
        <p v-if="learn.explanationPersian" class="fa-text mt-1 text-gray-600" lang="fa">{{ learn.explanationPersian }}</p>

        <div v-if="learn.example" class="mt-3 rounded-xl bg-white p-3">
            <p class="text-gray-800" dir="ltr" lang="en">{{ learn.example }}</p>
            <p v-if="learn.examplePersian" class="fa-text text-gray-500" lang="fa">{{ learn.examplePersian }}</p>
        </div>

        <div v-if="learn.feedback" class="mt-3 border-t border-gray-200 pt-3" data-testid="transfer-feedback">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">In this situation</p>
            <p class="mt-1 text-gray-700">{{ learn.feedback }}</p>
            <p v-if="learn.feedbackPersian" class="fa-text text-gray-600" lang="fa">{{ learn.feedbackPersian }}</p>
        </div>
    </section>
</template>
