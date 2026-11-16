<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'

/** Feedback panel shown after an answer: outcome, the correct answer when wrong, optional extra (audio, meaning). */
defineProps<{
    correct: boolean
    answer?: string
}>()
</script>

<template>
    <div
        class="rounded-2xl border p-4"
        :class="correct ? 'border-green-600/25 bg-green-50' : 'border-red-600/25 bg-red-50'"
        role="status"
        data-testid="feedback"
    >
        <p class="flex items-center gap-2 font-semibold" :class="correct ? 'text-green-600' : 'text-red-600'">
            <AppIcon :name="correct ? 'check' : 'close'" :size="18" />
            {{ correct ? 'Correct' : 'Not quite' }}
        </p>
        <div v-if="!correct && answer" class="mt-2">
            <p class="text-xs text-gray-400">Correct answer</p>
            <p class="wrap-anywhere text-lg font-semibold text-gray-900" dir="ltr">{{ answer }}</p>
        </div>
        <div v-if="$slots.default" class="mt-2 text-sm text-gray-600"><slot /></div>
    </div>
</template>
