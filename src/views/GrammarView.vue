<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadGrammarManifest, loadGrammarTopic } from '../services/grammarContent'
import { useGrammarProgressStore } from '../stores/grammarProgress'
import { usePerformanceStore } from '../stores/performance'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'

import type { GrammarTopic, GrammarTopicManifest } from '../types/grammar'
import type { ExerciseResult } from '../types/exercise'

const PASS_THRESHOLD = 0.7

const grammarProgressStore = useGrammarProgressStore()
const performanceStore = usePerformanceStore()

const topics = ref<GrammarTopicManifest[]>([])
const loading = ref(false)
const error = ref('')

/* learn flow */
const activeTopic = ref<GrammarTopic | null>(null)
const phase = ref<'list' | 'explanation' | 'exercises' | 'summary'>('list')
const exerciseIndex = ref(0)
const sessionResults = ref<ExerciseResult[]>([])

const groupedTopics = computed(() => {
    const groups = new Map<string, GrammarTopicManifest[]>()

    for (const topic of topics.value) {
        const level = topic.cefrLevel ?? 'Unlevelled'

        if (!groups.has(level)) {
            groups.set(level, [])
        }

        groups.get(level)!.push(topic)
    }

    return Array.from(groups.entries()).map(([level, items]) => ({ level, items }))
})

const currentExercise = computed(() =>
    activeTopic.value?.exercises[exerciseIndex.value] ?? null
)

const currentAnswered = computed(() =>
    sessionResults.value.length > exerciseIndex.value
)

const correctCount = computed(
    () => sessionResults.value.filter(result => result.correct).length
)

const sessionPassed = computed(() => {
    const total = sessionResults.value.length

    return total > 0 && correctCount.value / total >= PASS_THRESHOLD
})

function statusLabel(topicId: string): string {
    const item = grammarProgressStore.progress.find(p => p.topicId === topicId)

    if (!item || item.status === 'new') return ''

    return item.status
}

function isDue(topicId: string): boolean {
    return grammarProgressStore
        .getDueTopics()
        .some(item => item.topicId === topicId)
}

async function openTopic(manifest: GrammarTopicManifest) {
    loading.value = true
    error.value = ''

    try {
        activeTopic.value = await loadGrammarTopic(manifest)
        phase.value = 'explanation'
        exerciseIndex.value = 0
        sessionResults.value = []
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load topic'
    } finally {
        loading.value = false
    }
}

function startExercises() {
    phase.value = 'exercises'
}

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    const exercise = currentExercise.value

    performanceStore.record({
        skill: 'grammar',
        activityId: result.exerciseId,
        lessonId: activeTopic.value?.id ?? null,
        difficulty: exercise?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['grammar'],
    })
}

function nextExercise() {
    if (!activeTopic.value) return

    if (exerciseIndex.value < activeTopic.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    finishSession()
}

function finishSession() {
    if (!activeTopic.value) return

    const wrongCount = sessionResults.value.length - correctCount.value

    grammarProgressStore.recordSession(
        activeTopic.value.id,
        sessionPassed.value,
        correctCount.value,
        wrongCount
    )

    phase.value = 'summary'
}

function backToList() {
    activeTopic.value = null
    phase.value = 'list'
    sessionResults.value = []
    exerciseIndex.value = 0
}

onMounted(async () => {
    loading.value = true

    try {
        topics.value = (await loadGrammarManifest()).topics
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load grammar topics'
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div class="mx-auto max-w-3xl">
        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <!-- TOPIC LIST -->
        <div v-if="phase === 'list'">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900">Grammar</h1>
                <p class="mt-2 text-gray-500">
                    Short, practical topics — learn the pattern, then use it in exercises.
                </p>
            </div>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading topics...</div>

            <div v-for="group in groupedTopics" :key="group.level" class="mb-8">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                    {{ group.level }}
                </h2>

                <div class="grid gap-3 sm:grid-cols-2">
                    <button
                        v-for="topic in group.items"
                        :key="topic.id"
                        type="button"
                        class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        @click="openTopic(topic)"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <p class="font-semibold text-gray-900">{{ topic.title }}</p>
                            <span
                                v-if="isDue(topic.id)"
                                class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
                            >
                                due
                            </span>
                            <span
                                v-else-if="statusLabel(topic.id)"
                                class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                            >
                                {{ statusLabel(topic.id) }}
                            </span>
                        </div>

                        <p v-if="topic.titlePersian" class="mt-1 text-sm text-gray-500" dir="rtl">
                            {{ topic.titlePersian }}
                        </p>

                        <p class="mt-2 text-xs text-gray-400">
                            {{ topic.category }}
                            <span v-if="topic.estimatedDuration"> · ~{{ topic.estimatedDuration }} min</span>
                        </p>
                    </button>
                </div>
            </div>
        </div>

        <!-- EXPLANATION + EXAMPLES -->
        <div v-else-if="phase === 'explanation' && activeTopic">
            <button type="button" class="mb-6 text-sm text-gray-500 hover:text-black" @click="backToList">
                ← All topics
            </button>

            <h1 class="text-3xl font-bold text-gray-900">{{ activeTopic.title }}</h1>

            <div class="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p class="leading-relaxed text-gray-800">{{ activeTopic.explanation }}</p>

                <p
                    v-if="activeTopic.explanationPersian"
                    class="mt-4 rounded-xl bg-gray-50 p-4 leading-relaxed text-gray-700"
                    dir="rtl"
                >
                    {{ activeTopic.explanationPersian }}
                </p>
            </div>

            <div class="mt-6 space-y-3">
                <div
                    v-for="(example, index) in activeTopic.examples"
                    :key="index"
                    class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                    <div class="flex items-center justify-between gap-3">
                        <p class="font-medium text-gray-900">{{ example.english }}</p>
                        <SpeechButton :text="example.english" lang="en-US" />
                    </div>
                    <p v-if="example.persian" class="mt-1 text-sm text-gray-500" dir="rtl">
                        {{ example.persian }}
                    </p>
                    <p v-if="example.note" class="mt-1 text-xs text-gray-400">{{ example.note }}</p>
                </div>
            </div>

            <button
                type="button"
                class="mt-8 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
                @click="startExercises"
            >
                Start exercises ({{ activeTopic.exercises.length }})
            </button>
        </div>

        <!-- EXERCISES -->
        <div v-else-if="phase === 'exercises' && activeTopic && currentExercise">
            <div class="mb-6 flex items-center justify-between text-sm text-gray-500">
                <span>{{ activeTopic.title }}</span>
                <span>{{ exerciseIndex + 1 }} / {{ activeTopic.exercises.length }}</span>
            </div>

            <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <ExercisePlayer
                    :key="currentExercise.id"
                    :exercise="currentExercise"
                    @result="onExerciseResult"
                />

                <button
                    v-if="currentAnswered"
                    type="button"
                    class="mt-6 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="nextExercise"
                >
                    {{ exerciseIndex === activeTopic.exercises.length - 1 ? 'Finish' : 'Next' }}
                </button>
            </div>
        </div>

        <!-- SUMMARY -->
        <div v-else-if="phase === 'summary' && activeTopic" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div class="text-5xl">{{ sessionPassed ? '🎉' : '💪' }}</div>
            <h2 class="mt-4 text-2xl font-bold">
                {{ correctCount }} / {{ sessionResults.length }} correct
            </h2>
            <p class="mt-2 text-gray-500">
                {{ sessionPassed
                    ? 'Session passed — this topic is scheduled for spaced review.'
                    : 'Below the pass mark — the topic will come back soon for another try.' }}
            </p>
            <div class="mt-8 flex justify-center gap-3">
                <button
                    type="button"
                    class="rounded-xl border px-5 py-3 text-gray-600 hover:bg-gray-100"
                    @click="openTopic(topics.find(topic => topic.id === activeTopic!.id)!)"
                >
                    Practice again
                </button>
                <button
                    type="button"
                    class="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="backToList"
                >
                    All topics
                </button>
            </div>
        </div>
    </div>
</template>
