<script setup lang="ts">
/**
 * Title block shared by every top-level screen: section eyebrow, title,
 * optional Persian line (RTL) and an actions slot. `serif` gives the
 * editorial treatment used by Learn and the Dashboard.
 */
defineProps<{
    title: string
    eyebrow?: string
    description?: string
    descriptionPersian?: string
    serif?: boolean
}>()
</script>

<template>
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div class="min-w-0 max-w-2xl">
            <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
            <h1
                class="wrap-anywhere mt-1 text-[1.75rem] font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl"
                :class="serif ? 'font-display font-semibold' : ''"
            >{{ title }}</h1>
            <p v-if="description" class="mt-2 text-base leading-relaxed text-gray-500">{{ description }}</p>
            <p v-if="descriptionPersian" class="fa-text mt-1 text-sm text-gray-400" lang="fa">{{ descriptionPersian }}</p>
        </div>
        <div v-if="$slots.default" class="flex shrink-0 flex-wrap items-center gap-2"><slot /></div>
    </header>
</template>
