<script setup lang="ts">
import PageHeader from '../ui/PageHeader.vue'

/** Shared frame for every exercise screen: practice-mode header + a readable column. */
defineProps<{
    eyebrow: string
    title: string
    description?: string
    wide?: boolean
}>()
</script>

<template>
    <section class="mx-auto" :class="wide ? 'max-w-4xl' : 'max-w-2xl'">
        <PageHeader :eyebrow="eyebrow" :title="title" :description="description" />
        <div class="mt-6 space-y-5"><slot /></div>
    </section>
</template>
