<script setup lang="ts">
import type { DimensionResult } from '../../types/skillGap'

/** Two dimensions side by side. Only compares when BOTH have enough evidence. */
defineProps<{ title: string; titlePersian: string; left: { label: string; result: DimensionResult }; right: { label: string; result: DimensionResult } }>()

const usable = (result: DimensionResult) => result.classification !== 'insufficient' && result.estimate !== null
</script>

<template>
    <div class="rounded-2xl bg-gray-50 p-4">
        <p class="text-sm font-semibold text-gray-900">{{ title }}</p>
        <p class="fa-text text-xs text-gray-400" lang="fa">{{ titlePersian }}</p>

        <template v-if="usable(left.result) && usable(right.result)">
            <div v-for="side in [left, right]" :key="side.label" class="mt-3">
                <div class="flex justify-between text-xs text-gray-600"><span>{{ side.label }}</span><span class="font-semibold tabular-nums">{{ side.result.estimate }}%</span></div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-white"><div class="h-full rounded-full bg-accent" :style="{ width: `${side.result.estimate}%` }" /></div>
            </div>
        </template>
        <p v-else class="mt-2 text-xs text-gray-500">A comparison needs enough independent answers in both ({{ left.label.toLowerCase() }}: {{ left.result.observations }}, {{ right.label.toLowerCase() }}: {{ right.result.observations }}).</p>
    </div>
</template>
