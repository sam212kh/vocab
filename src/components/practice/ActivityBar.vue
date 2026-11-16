<script setup lang="ts">
import PracticeProgress from './PracticeProgress.vue'

/** Position + score for a running exercise. Segments show how far you are, not right/wrong. */
defineProps<{
    current: number
    total: number
    score?: number
    unit?: string
}>()
</script>

<template>
    <div class="flex items-center gap-3">
        <span class="w-14 shrink-0 text-sm font-semibold tabular-nums text-gray-700">{{ Math.min(current + 1, total) }}<span class="font-normal text-gray-400"> / {{ total }}</span></span>
        <PracticeProgress :total="total" :current="current" :results="[]" plain :done="current" />
        <span v-if="score !== undefined" class="w-16 shrink-0 text-right text-sm tabular-nums text-gray-500" aria-label="Score">{{ score }} {{ unit ?? 'correct' }}</span>
    </div>
</template>
