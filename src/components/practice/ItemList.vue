<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'

export interface ListItem {
    id: string
    title: string
    subtitle?: string
    subtitlePersian?: string
    meta?: string
    badge?: { text: string; tone: 'neutral' | 'warn' | 'good' } | null
}

/** One compact, tappable list per group — replaces grids of identical cards. */
defineProps<{ items: ListItem[]; heading?: string }>()
const emit = defineEmits<{ open: [id: string] }>()

const TONE = {
    neutral: 'bg-gray-100 text-gray-500',
    warn: 'bg-amber-100 text-amber-700',
    good: 'bg-green-100 text-green-700',
}
</script>

<template>
    <section>
        <h2 v-if="heading" class="label mb-2 px-1">{{ heading }}</h2>
        <ul class="surface divide-y divide-gray-100 overflow-hidden">
            <li v-for="item in items" :key="item.id">
                <button
                    type="button"
                    class="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none sm:px-5"
                    @click="emit('open', item.id)"
                >
                    <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-2">
                            <span class="wrap-anywhere font-semibold text-gray-900">{{ item.title }}</span>
                            <span v-if="item.badge" class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="TONE[item.badge.tone]">{{ item.badge.text }}</span>
                        </span>
                        <span v-if="item.subtitlePersian" class="fa-text mt-0.5 block text-sm text-gray-500" lang="fa">{{ item.subtitlePersian }}</span>
                        <span v-if="item.subtitle" class="mt-0.5 block text-sm text-gray-500">{{ item.subtitle }}</span>
                        <span v-if="item.meta" class="mt-0.5 block text-xs text-gray-400">{{ item.meta }}</span>
                    </span>
                    <AppIcon name="chevron-right" :size="18" class="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                </button>
            </li>
        </ul>
    </section>
</template>
