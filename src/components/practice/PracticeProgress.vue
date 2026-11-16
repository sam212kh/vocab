<script setup lang="ts">
/** Practice progress: one segment per task, coloured by outcome so far. */
defineProps<{
    total: number
    current: number
    results: ('correct' | 'wrong')[]
    /** Position-only mode: finished segments are neutral (no right/wrong colouring). */
    plain?: boolean
    /** In plain mode: how many segments are finished. */
    done?: number
}>()
</script>

<template>
    <div
        class="flex min-w-0 flex-1 gap-1"
        role="progressbar"
        aria-label="Practice progress"
        :aria-valuemin="0"
        :aria-valuemax="total"
        :aria-valuenow="plain ? (done ?? 0) : results.length"
    >
        <span
            v-for="(_, index) in total"
            :key="index"
            class="motion-safe-only h-2 min-w-0 flex-1 rounded-full transition-colors duration-300"
            :class="plain
                ? (index < (done ?? 0) ? 'bg-accent/60' : index === current ? 'bg-accent' : 'bg-gray-200')
                : results[index] === 'correct'
                    ? 'bg-good-600'
                    : results[index] === 'wrong'
                        ? 'bg-bad-600'
                        : index === current
                            ? 'bg-practice-500'
                            : 'bg-work-line'"
        />
    </div>
</template>
