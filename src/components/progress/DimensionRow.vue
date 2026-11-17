<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '../ui/AppIcon.vue'

import { DIMENSION_LABEL, DIMENSION_LABEL_FA, GAP_RULES } from '../../services/skillGap'
import type { DimensionResult } from '../../types/skillGap'

const props = defineProps<{ result: DimensionResult }>()

const CHIP: Record<DimensionResult['classification'], { label: string; cls: string }> = {
    strength: { label: 'Strength', cls: 'bg-green-50 text-green-700' },
    developing: { label: 'Developing', cls: 'bg-amber-50 text-amber-700' },
    weakness: { label: 'Needs practice', cls: 'bg-red-50 text-red-700' },
    insufficient: { label: 'Not enough evidence', cls: 'bg-gray-100 text-gray-500' },
}

const TREND: Record<DimensionResult['trend'], { label: string; icon: string; cls: string } | null> = {
    improving: { label: 'Improving', icon: 'chevron-right', cls: 'text-green-600 -rotate-90' },
    declining: { label: 'Declining', icon: 'chevron-right', cls: 'text-red-600 rotate-90' },
    steady: { label: 'Steady', icon: 'chevron-right', cls: 'text-gray-400' },
    unknown: null,
}

const chip = computed(() => CHIP[props.result.classification])
const trend = computed(() => TREND[props.result.trend])
const barTone = computed(() => ({ strength: 'bg-green-600', developing: 'bg-amber-500', weakness: 'bg-red-500', insufficient: 'bg-gray-300' })[props.result.classification])
</script>

<template>
    <li class="py-3.5" :data-dimension="result.dimension">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div class="min-w-0 flex-1">
                <p class="font-semibold text-gray-900">{{ DIMENSION_LABEL[result.dimension] }}</p>
                <p class="fa-text text-xs text-gray-400" lang="fa">{{ DIMENSION_LABEL_FA[result.dimension] }}</p>
            </div>
            <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="chip.cls">{{ chip.label }}</span>
        </div>

        <div v-if="result.classification !== 'insufficient' && result.estimate !== null" class="mt-2 flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" role="img" :aria-label="`${result.estimate}% over ${result.observations} independent answers`">
                <div class="h-full rounded-full" :class="barTone" :style="{ width: `${result.estimate}%` }" />
            </div>
            <span class="w-10 text-right text-sm font-semibold tabular-nums text-gray-800">{{ result.estimate }}%</span>
            <span v-if="trend" class="flex items-center gap-0.5 text-xs text-gray-500"><AppIcon :name="trend.icon" :size="14" :class="trend.cls" /> {{ trend.label }}</span>
        </div>
        <div v-else class="mt-2 flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div class="h-full rounded-full bg-gray-300" :style="{ width: `${Math.min(100, (result.observations / GAP_RULES.minObservations) * 100)}%` }" /></div>
            <span class="text-xs tabular-nums text-gray-400">{{ result.observations }} / {{ GAP_RULES.minObservations }} answers</span>
        </div>

        <p class="mt-1.5 text-xs leading-relaxed text-gray-500">{{ result.why }}</p>

        <RouterLink v-if="result.recommendation" :to="result.recommendation.to" class="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
            {{ result.recommendation.label }} <AppIcon name="chevron-right" :size="15" />
        </RouterLink>
    </li>
</template>
