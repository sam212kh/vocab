<script setup lang="ts">
import { computed } from 'vue'

import { useSkillProfileStore } from '../stores/skillProfile'
import { useWordProgressStore } from '../stores/wordProgress'
import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'
import { SKILL_NAMES } from '../types/skillProfile'
import type { SkillName } from '../types/skillProfile'

const skillProfileStore = useSkillProfileStore()
const wordProgressStore = useWordProgressStore()

const SKILL_LABELS: Record<SkillName, string> = {
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    listening: 'Listening',
    speaking: 'Speaking',
    reading: 'Reading',
    writing: 'Writing',
}

/*
 * This is observed EXERCISE COMPLETION for vocabulary review, not a CEFR
 * level — the roadmap explicitly forbids deriving a CEFR estimate from
 * vocabulary recall statistics alone, so it is shown as its own separate,
 * clearly-labeled metric rather than feeding into the skill's level.
 */
const vocabularyMasteryPercent = computed(() => {
    const progress = wordProgressStore.progress

    if (!progress.length) {
        return null
    }

    const mastered = progress.filter(item => item.status === 'mastered').length

    return Math.round((mastered / progress.length) * 100)
})

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString()
}

function selfReport(skill: SkillName, level: CefrLevel) {
    skillProfileStore.selfReportLevel(skill, level)
}
</script>

<template>
    <div class="mx-auto max-w-4xl space-y-8">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Skills</h1>
            <p class="mt-2 text-gray-500">
                Six independent skills — a strong vocabulary score does not imply the same
                level in speaking or writing. Levels shown as "Not yet assessed" simply mean
                no real data exists yet; nothing is guessed.
            </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div
                v-for="skill in SKILL_NAMES"
                :key="skill"
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <div class="flex items-start justify-between">
                    <h2 class="text-lg font-semibold text-gray-900">
                        {{ SKILL_LABELS[skill] }}
                    </h2>

                    <span
                        v-if="skillProfileStore.profile.skills[skill].current"
                        class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                    >
                        {{ skillProfileStore.profile.skills[skill].current!.level }}
                        · {{ skillProfileStore.profile.skills[skill].current!.source }}
                    </span>
                    <span v-else class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-400">
                        Not yet assessed
                    </span>
                </div>

                <p
                    v-if="skillProfileStore.profile.skills[skill].current"
                    class="mt-1 text-xs text-gray-400"
                >
                    Last updated {{ formatDate(skillProfileStore.profile.skills[skill].current!.recordedAt) }}
                    · confidence {{ Math.round(skillProfileStore.profile.skills[skill].current!.confidence * 100) }}%
                </p>

                <p
                    v-if="skill === 'vocabulary' && vocabularyMasteryPercent !== null"
                    class="mt-3 text-sm text-gray-500"
                >
                    {{ vocabularyMasteryPercent }}% of studied words mastered (exercise completion,
                    not a CEFR claim)
                </p>

                <div class="mt-4">
                    <p class="mb-2 text-xs font-medium text-gray-500">Self-report your level</p>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="level in CEFR_LEVELS"
                            :key="level"
                            type="button"
                            class="rounded-full border px-2.5 py-1 text-xs transition"
                            :class="skillProfileStore.profile.skills[skill].current?.level === level
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            @click="selfReport(skill, level)"
                        >
                            {{ level }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
