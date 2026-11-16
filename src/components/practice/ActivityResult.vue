<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'

/** End-of-activity summary: a score ring (or a check for non-scored activities) and one clear next action. */
const props = defineProps<{
    title: string
    score?: number
    total?: number
    message?: string
    actionLabel: string
}>()

const emit = defineEmits<{ action: [] }>()

const RING = 2 * Math.PI * 52
const offset = props.total ? RING * (1 - (props.score ?? 0) / props.total) : 0
</script>

<template>
    <div class="surface px-6 py-10 text-center sm:py-12" role="status">
        <div class="relative mx-auto h-32 w-32">
            <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e0e4ea" stroke-width="9" />
                <circle
                    cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"
                    class="text-accent motion-safe-only transition-all duration-700"
                    :stroke-dasharray="RING" :stroke-dashoffset="total ? offset : 0"
                />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
                <span v-if="total" class="text-3xl font-bold tabular-nums text-gray-900">{{ score }}<span class="text-base font-medium text-gray-400"> / {{ total }}</span></span>
                <AppIcon v-else name="check" :size="40" class="text-accent" />
            </div>
        </div>

        <h2 class="mt-5 text-2xl font-bold text-gray-900">{{ title }}</h2>
        <p v-if="message" class="mx-auto mt-1 max-w-sm text-sm text-gray-500">{{ message }}</p>

        <div class="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <slot name="secondary" />
            <button type="button" class="btn-primary btn-lg min-w-56" @click="emit('action')">{{ actionLabel }}</button>
        </div>
    </div>
</template>
