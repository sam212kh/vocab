<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'

import type { LearnItem } from '../../services/learnItems'

/**
 * Free movement through the lesson. `bar` = previous / contents / next;
 * `list` = the contents (rail on desktop, sheet on phones). Nothing is
 * locked: any expression can be opened at any time, in any order.
 */
defineProps<{
    mode: 'bar' | 'list'
    current: number
    total: number
    items?: LearnItem[]
    visited?: boolean[]
    isSaved?: (item: LearnItem) => boolean
    finishLabel?: string
    /** A persistent contents rail is visible (wide layouts) — hides the contents button there. */
    rail?: boolean
}>()

const emit = defineEmits<{ prev: []; next: []; contents: []; go: [index: number] }>()
</script>

<template>
    <!-- Previous / contents / next -->
    <nav v-if="mode === 'bar'" class="flex items-center gap-2 sm:gap-3" aria-label="Lesson navigation">
        <button
            type="button"
            class="flex min-h-12 items-center justify-center gap-1 rounded-2xl border border-line bg-white px-4 text-sm font-medium text-ink-soft shadow-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30 disabled:opacity-40"
            :disabled="current <= 0"
            aria-label="Previous expression"
            @click="emit('prev')"
        >
            <AppIcon name="chevron-left" />
            <span class="hidden sm:inline">Previous</span>
        </button>

        <button
            type="button"
            class="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-medium tabular-nums text-ink-soft shadow-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
            :class="rail ? 'lg:hidden' : ''"
            aria-label="Open lesson contents"
            @click="emit('contents')"
        >
            <AppIcon name="list" :size="18" />
            {{ current + 1 }} / {{ total }}
        </button>
        <span v-if="rail" class="hidden flex-1 text-center text-sm tabular-nums text-ink-faint lg:block">{{ current + 1 }} / {{ total }}</span>

        <button
            type="button"
            class="flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-learn-600 px-5 text-sm font-semibold text-white shadow-soft transition hover:bg-learn-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/40"
            :aria-label="current >= total - 1 ? (finishLabel ?? 'Finish lesson') : 'Next expression'"
            @click="emit('next')"
        >
            <span>{{ current >= total - 1 ? (finishLabel ?? 'Finish') : 'Next' }}</span>
            <AppIcon name="chevron-right" />
        </button>
    </nav>

    <!-- Contents -->
    <ol v-else class="space-y-0.5" aria-label="Lesson contents">
        <li v-for="(item, index) in items" :key="item.id">
            <button
                type="button"
                class="motion-safe-only flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-learn-500"
                :class="index === current ? 'bg-learn-50 text-learn-900' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'"
                :aria-current="index === current ? 'true' : undefined"
                @click="emit('go', index)"
            >
                <span
                    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums"
                    :class="index === current ? 'bg-learn-600 text-white' : visited?.[index] ? 'bg-learn-100 text-learn-700' : 'bg-paper-deep text-ink-faint'"
                >{{ index + 1 }}</span>
                <span class="min-w-0 flex-1 truncate text-sm" dir="ltr">{{ item.text }}</span>
                <AppIcon v-if="isSaved?.(item)" name="bookmark-fill" :size="14" class="text-learn-600" />
            </button>
        </li>
    </ol>
</template>
