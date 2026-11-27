<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import type { RoadmapStageStatus } from '../../types/journey'
import { useLocale } from '../../services/locale'

/**
 * The learning-path timeline: connected nodes, state-colored, "you are
 * here" on the current stage. Extracted from JourneyView so the same path
 * can render both inline (Daily Journey) and as its own screen
 * (LearningPathView) without duplicating the markup.
 */
defineProps<{
    roadmap: RoadmapStageStatus[]
    currentStage: RoadmapStageStatus | null
}>()

const { t } = useLocale()

function title(stage: RoadmapStageStatus): string {
    return t(`roadmap.stage.${stage.id}.title`)
}

function description(stage: RoadmapStageStatus): string {
    return t(`roadmap.stage.${stage.id}.description`)
}

function requirement(stage: RoadmapStageStatus): string {
    const thresholds = stage.thresholds
    if (!thresholds) return stage.requirement

    return [
        thresholds.recall ? t('roadmap.requirement.recalls', { count: String(thresholds.recall) }) : '',
        thresholds.production ? t('roadmap.requirement.sentences', { count: String(thresholds.production) }) : '',
        thresholds.fluency ? t('roadmap.requirement.spoken', { count: String(thresholds.fluency) }) : '',
        t('roadmap.requirement.journeys', { count: String(thresholds.journeys) }),
    ].filter(Boolean).join(' · ')
}
</script>

<template>
    <ol class="surface p-4 sm:p-5">
        <li v-for="(stage, index) in roadmap" :key="stage.id" class="relative flex gap-4 pb-5 last:pb-0">
            <span v-if="index < roadmap.length - 1" class="absolute left-[0.95rem] top-8 bottom-0 w-px bg-gray-200" aria-hidden="true" />

            <span
                class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
                :class="{
                    'border-green-600 bg-green-600 text-white': stage.state === 'completed',
                    'border-accent bg-accent text-white ring-4 ring-accent/15': stage.id === currentStage?.id && stage.state !== 'completed',
                    'border-accent/50 bg-white text-accent': stage.id !== currentStage?.id && (stage.state === 'in-progress' || stage.state === 'available'),
                    'border-gray-200 bg-white text-gray-300': stage.state === 'locked',
                    'border-dashed border-amber-300 bg-amber-50 text-amber-600': stage.state === 'content-pending',
                }"
            >
                <AppIcon v-if="stage.state === 'completed'" name="check" :size="15" />
                <AppIcon v-else-if="stage.state === 'locked'" name="lock" :size="13" />
                <span v-else class="text-xs font-semibold tabular-nums">{{ index + 1 }}</span>
            </span>

            <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p class="font-semibold text-gray-900" :class="stage.state === 'locked' ? 'text-gray-500' : ''">{{ title(stage) }}</p>
                    <span v-if="stage.id === currentStage?.id" class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">{{ t('roadmap.youAreHere') }}</span>
                    <span v-else-if="stage.state === 'content-pending'" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{{ t('roadmap.contentComing') }}</span>
                </div>
                <p class="text-sm text-gray-500">{{ description(stage) }}</p>
                <div v-if="stage.progress > 0" class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div class="h-full rounded-full bg-accent motion-safe-only transition-all" :style="{ width: `${Math.round(stage.progress * 100)}%` }" />
                </div>
                <p class="mt-1 text-xs text-gray-400">{{ requirement(stage) }}</p>
            </div>
        </li>
    </ol>
</template>
