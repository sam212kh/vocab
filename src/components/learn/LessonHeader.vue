<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

import AppIcon from '../ui/AppIcon.vue'
import LearningIllustration from '../art/LearningIllustration.vue'

/** Lesson identity: where you are, what it is, and a way to the book page. */
defineProps<{
    eyebrow: string
    title: string
    subtitle?: string
    meta?: string[]
    scene?: string
    seed?: string
    backTo?: RouteLocationRaw
    backLabel?: string
    hasBookPage?: boolean
    /** Hide the back link when the host page already provides one. */
    hideBack?: boolean
}>()

const emit = defineEmits<{ back: []; 'book-page': [] }>()
</script>

<template>
    <header class="flex items-stretch gap-4 sm:gap-6">
        <div class="min-w-0 flex-1 py-1">
            <div class="flex items-center gap-2 text-xs" :class="hideBack ? 'min-h-11' : ''">
                <RouterLink
                    v-if="backTo && !hideBack"
                    :to="backTo"
                    class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
                >
                    <AppIcon name="arrow-left" :size="16" />
                    {{ backLabel ?? 'Back' }}
                </RouterLink>
                <button
                    v-else-if="!hideBack"
                    type="button"
                    class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
                    @click="emit('back')"
                >
                    <AppIcon name="arrow-left" :size="16" />
                    {{ backLabel ?? 'Back' }}
                </button>
                <span class="rounded-full bg-learn-100 px-2.5 py-1 font-semibold uppercase tracking-[0.1em] text-learn-700">{{ eyebrow }}</span>
            </div>

            <h1 class="font-display wrap-anywhere mt-1 text-[1.65rem] font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{{ title }}</h1>
            <p v-if="subtitle" class="wrap-anywhere mt-1 text-sm text-ink-soft sm:text-base" dir="auto">{{ subtitle }}</p>

            <p v-if="meta?.length" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                <span v-for="item in meta" :key="item">{{ item }}</span>
            </p>

            <button
                v-if="hasBookPage"
                type="button"
                class="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
                @click="emit('book-page')"
            >
                <AppIcon name="book" :size="16" /> Book page
            </button>
        </div>

        <div class="hidden w-44 shrink-0 overflow-hidden rounded-2xl border border-line sm:block lg:w-56" aria-hidden="true">
            <LearningIllustration :scene="scene" :seed="seed || title" />
        </div>
    </header>
</template>
