<script setup lang="ts">
import { computed, ref } from 'vue'

import ExercisePlayer from '../exercise/ExercisePlayer.vue'
import { useToastStore } from '../../stores/toast'

import type { Exercise } from '../../types/exercise'
import type { FollowUpExercise, WritingEvaluation } from '../../types/writing'

const props = defineProps<{
    evaluation: WritingEvaluation
    originalText: string
}>()

const toastStore = useToastStore()

const activeVersion = ref<'original' | 'corrected' | 'natural'>('corrected')
const practiceIndex = ref<number | null>(null)

const versionText = computed(() => {
    if (activeVersion.value === 'original') return props.originalText
    if (activeVersion.value === 'natural') return props.evaluation.naturalVersion
    return props.evaluation.correctedVersion
})

const errorCount = computed(
    () => props.evaluation.sentences.filter(s => s.kind === 'error').length
)

const styleCount = computed(
    () => props.evaluation.sentences.filter(s => s.kind === 'style').length
)

async function copyVersion() {
    try {
        await navigator.clipboard.writeText(versionText.value)
        toastStore.push('Copied.', 'success')
    } catch {
        toastStore.push('Could not copy to clipboard.', 'error')
    }
}

/** Map a gateway follow-up exercise onto the unified exercise engine. */
function toEngineExercise(item: FollowUpExercise, index: number): Exercise {
    const id = `followup-${props.evaluation.evaluatedAt}-${index}`

    if (item.type === 'grammar-correction') {
        return {
            id,
            type: 'grammar-correction',
            skill: 'writing',
            incorrectSentence: item.prompt,
            acceptedAnswers: item.acceptedAnswers,
            explanation: item.explanation,
        }
    }

    if (item.type === 'fill-blank') {
        const gap = item.prompt.indexOf('___')
        const before = gap === -1 ? item.prompt : item.prompt.slice(0, gap).trim()
        const after = gap === -1 ? '' : item.prompt.slice(gap + 3).trim()

        return {
            id,
            type: 'fill-blank',
            skill: 'writing',
            before,
            after,
            acceptedAnswers: item.acceptedAnswers,
            explanation: item.explanation,
        }
    }

    return {
        id,
        type: 'short-answer',
        skill: 'writing',
        prompt: item.prompt,
        acceptedAnswers: item.acceptedAnswers,
        explanation: item.explanation,
    }
}

const practiceExercises = computed(() =>
    props.evaluation.followUpExercises.map((item, index) => toEngineExercise(item, index))
)
</script>

<template>
    <div class="space-y-5">
        <!-- Meta + overall -->
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span class="rounded-full bg-gray-100 px-2 py-0.5">{{ evaluation.provider }} · {{ evaluation.model }}</span>
                <span>{{ (evaluation.durationMs / 1000).toFixed(1) }}s</span>
                <span v-if="evaluation.fallbackUsed" class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                    evaluated via fallback provider
                </span>
                <span class="text-gray-300">AI teaching feedback — not a certified assessment</span>
            </div>

            <p class="mt-3 text-gray-800">{{ evaluation.overall }}</p>

            <p class="mt-2 text-sm text-gray-500">
                {{ errorCount }} actual {{ errorCount === 1 ? 'error' : 'errors' }}
                <span v-if="styleCount"> · {{ styleCount }} optional style {{ styleCount === 1 ? 'suggestion' : 'suggestions' }}</span>
            </p>
        </div>

        <!-- Versions -->
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex gap-1">
                    <button
                        v-for="version in (['original', 'corrected', 'natural'] as const)"
                        :key="version"
                        type="button"
                        class="rounded-lg px-3 py-1.5 text-sm transition"
                        :class="activeVersion === version ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'"
                        @click="activeVersion = version"
                    >
                        {{ version === 'original' ? 'Your text' : version === 'corrected' ? 'Corrected' : 'Natural' }}
                    </button>
                </div>

                <button type="button" class="text-sm text-gray-500 hover:text-black" @click="copyVersion">
                    ⧉ Copy
                </button>
            </div>

            <p class="mt-4 whitespace-pre-wrap leading-relaxed text-gray-800" dir="auto">{{ versionText }}</p>
        </div>

        <!-- Sentence-level feedback -->
        <div v-if="evaluation.sentences.length" class="space-y-3">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">Sentence feedback</h3>

            <div
                v-for="(sentence, index) in evaluation.sentences"
                :key="index"
                class="rounded-2xl border bg-white p-5 shadow-sm"
                :class="sentence.kind === 'error' ? 'border-red-100' : 'border-blue-100'"
            >
                <div class="flex items-center gap-2 text-xs">
                    <span
                        class="rounded-full px-2 py-0.5 font-medium"
                        :class="sentence.kind === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'"
                    >
                        {{ sentence.kind === 'error' ? 'error' : 'style suggestion' }}
                    </span>
                    <span class="text-gray-400">{{ sentence.category }}</span>
                </div>

                <p class="mt-3 text-gray-500 line-through decoration-red-300">{{ sentence.original }}</p>
                <p class="mt-1 font-medium text-gray-900">{{ sentence.corrected }}</p>

                <p class="mt-3 text-sm text-gray-600">{{ sentence.explanation }}</p>
                <p v-if="sentence.explanationPersian" class="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600" dir="rtl">
                    {{ sentence.explanationPersian }}
                </p>
                <p v-if="sentence.example" class="mt-2 text-xs text-gray-400">
                    Example: {{ sentence.example }}
                </p>
            </div>
        </div>

        <div v-else class="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            No sentence-level errors were found in this text.
        </div>

        <!-- Vocabulary -->
        <div v-if="evaluation.vocabulary.length" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">Vocabulary</h3>
            <div v-for="(item, index) in evaluation.vocabulary" :key="index" class="mt-3 text-sm">
                <p>
                    <span class="text-gray-500">{{ item.original }}</span>
                    <span class="mx-2 text-gray-300">→</span>
                    <span class="font-medium text-gray-900">{{ item.suggestion }}</span>
                    <span
                        class="ml-2 rounded-full px-2 py-0.5 text-xs"
                        :class="item.kind === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'"
                    >{{ item.kind }}</span>
                </p>
                <p v-if="item.reason" class="mt-0.5 text-xs text-gray-400">{{ item.reason }}</p>
            </div>
        </div>

        <!-- Dimensions -->
        <div v-if="evaluation.dimensions.length" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">By dimension</h3>
            <div class="mt-3 space-y-3">
                <div v-for="dim in evaluation.dimensions" :key="dim.dimension" class="text-sm">
                    <p class="font-medium capitalize text-gray-900">{{ dim.dimension.replace(/-/g, ' ') }}</p>
                    <p class="text-gray-600">{{ dim.assessment }}</p>
                    <p v-if="dim.suggestion" class="text-xs text-gray-400">{{ dim.suggestion }}</p>
                </div>
            </div>
        </div>

        <!-- Priorities -->
        <div v-if="evaluation.priorities.length" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">Focus next on</h3>
            <ol class="mt-3 list-inside list-decimal space-y-1 text-sm text-gray-800">
                <li v-for="priority in evaluation.priorities" :key="priority">{{ priority }}</li>
            </ol>
        </div>

        <!-- Follow-up practice -->
        <div v-if="practiceExercises.length" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Practice your mistakes ({{ practiceExercises.length }})
            </h3>

            <div v-if="practiceIndex === null" class="mt-3">
                <button
                    type="button"
                    class="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
                    @click="practiceIndex = 0"
                >
                    Start practice
                </button>
            </div>

            <div v-else-if="practiceIndex < practiceExercises.length" class="mt-4">
                <p class="mb-3 text-xs text-gray-400">{{ practiceIndex + 1 }} / {{ practiceExercises.length }}</p>
                <ExercisePlayer
                    :key="practiceExercises[practiceIndex].id"
                    :exercise="practiceExercises[practiceIndex]"
                    @result="() => {}"
                />
                <button
                    type="button"
                    class="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
                    @click="practiceIndex!++"
                >
                    {{ practiceIndex === practiceExercises.length - 1 ? 'Done' : 'Next' }}
                </button>
            </div>

            <p v-else class="mt-3 text-sm text-green-700">✅ Practice complete.</p>
        </div>
    </div>
</template>
