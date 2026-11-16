<script setup lang="ts">
import { computed } from 'vue'

/**
 * Where you are in the lesson (position + what you have looked at), with the
 * learner's existing review stats alongside when available. Informational —
 * nothing here gates movement.
 */
const props = defineProps<{
    current: number
    total: number
    visited: boolean[]
    stats?: { studied: number; total: number; mastered: number }
}>()

const SEGMENT_LIMIT = 24

const segmented = computed(() => props.total <= SEGMENT_LIMIT)
const viewedCount = computed(() => props.visited.filter(Boolean).length)
const percent = computed(() => (props.total ? Math.round((viewedCount.value / props.total) * 100) : 0))
</script>

<template>
    <div>
        <div class="flex items-baseline justify-between text-xs text-ink-soft">
            <span class="font-semibold tabular-nums text-ink">{{ Math.min(current + 1, total) }} <span class="font-normal text-ink-faint">/ {{ total }}</span></span>
            <span class="tabular-nums">{{ viewedCount }} viewed</span>
        </div>

        <div
            class="mt-2"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="total"
            :aria-valuenow="viewedCount"
            aria-label="Lesson progress"
        >
            <div v-if="segmented" class="flex gap-1">
                <span
                    v-for="(seen, index) in visited"
                    :key="index"
                    class="motion-safe-only h-1.5 flex-1 rounded-full transition-colors"
                    :class="index === current ? 'bg-learn-600' : seen ? 'bg-learn-200' : 'bg-paper-deep'"
                />
            </div>
            <div v-else class="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                <div class="motion-safe-only h-full rounded-full bg-learn-500 transition-all" :style="{ width: `${percent}%` }" />
            </div>
        </div>

        <p v-if="stats && stats.studied" class="mt-2 text-xs text-ink-faint">
            {{ stats.studied }} of {{ stats.total }} in your review schedule<template v-if="stats.mastered"> · {{ stats.mastered }} mastered</template>
        </p>
    </div>
</template>
