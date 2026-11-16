<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/**
 * One consistent loading / empty / error presentation for every screen.
 * Loading uses skeleton shapes (no spinners that shift layout); errors are
 * announced to assistive tech and can offer a retry.
 */
withDefaults(defineProps<{
    kind: 'loading' | 'empty' | 'error'
    title?: string
    text?: string
    /** Number of skeleton rows for the loading state. */
    rows?: number
    actionLabel?: string
}>(), { rows: 3 })

const emit = defineEmits<{ action: [] }>()
</script>

<template>
    <div v-if="kind === 'loading'" class="surface p-5" role="status" aria-live="polite" :aria-label="title ?? 'Loading'">
        <div class="skeleton h-5 w-1/3" />
        <div v-for="row in rows" :key="row" class="skeleton mt-3 h-4" :class="row % 2 ? 'w-full' : 'w-4/5'" />
        <span class="sr-only">{{ title ?? 'Loading…' }}</span>
    </div>

    <div v-else class="surface px-6 py-8 text-center" :role="kind === 'error' ? 'alert' : 'status'">
        <span
            class="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
            :class="kind === 'error' ? 'bg-red-50 text-red-600' : 'bg-accent-soft text-accent-ink'"
        >
            <AppIcon :name="kind === 'error' ? 'alert' : 'sparkle'" :size="20" />
        </span>
        <p class="mt-3 font-semibold text-gray-900">{{ title ?? (kind === 'error' ? 'Something went wrong' : 'Nothing here yet') }}</p>
        <p v-if="text" class="mx-auto mt-1 max-w-sm text-sm text-gray-500" dir="auto">{{ text }}</p>
        <button v-if="actionLabel" type="button" class="btn-primary mt-4" @click="emit('action')">{{ actionLabel }}</button>
        <slot />
    </div>
</template>
