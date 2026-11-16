<script setup lang="ts">
import type { LearnMistake } from '../../services/learnItems'

/** Natural-usage guidance and common mistakes. Renders nothing without real content. */
defineProps<{
    note?: string
    mistakes?: LearnMistake[]
}>()
</script>

<template>
    <aside v-if="note || mistakes?.length" class="rounded-2xl bg-paper-deep p-4 sm:p-5">
        <p v-if="note" class="text-sm leading-relaxed text-ink-soft" dir="auto">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-learn-700">Natural usage</span>
            {{ note }}
        </p>

        <ul v-if="mistakes?.length" class="mt-3 space-y-2.5">
            <li v-for="mistake in mistakes" :key="mistake.wrong" class="text-sm" dir="ltr">
                <span class="mb-0.5 block text-xs font-semibold uppercase tracking-[0.08em] text-bad-600">Common mistake</span>
                <span class="text-bad-600 line-through decoration-bad-600/40">{{ mistake.wrong }}</span>
                <span class="mx-1.5 text-ink-faint">→</span>
                <span class="font-medium text-learn-700">{{ mistake.right }}</span>
                <span v-if="mistake.why" class="mt-0.5 block text-ink-soft">{{ mistake.why }}</span>
            </li>
        </ul>
    </aside>
</template>
