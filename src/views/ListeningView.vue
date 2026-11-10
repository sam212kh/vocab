<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadListeningManifest, loadListeningActivity } from '../services/listeningContent'
import { usePerformanceStore } from '../stores/performance'
import { speakAsync, stop as stopSpeech, getSpeechRate } from '../services/speech'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'

import type { ListeningActivity, ListeningActivityManifest } from '../types/listening'
import type { ExerciseResult } from '../types/exercise'

const performanceStore = usePerformanceStore()

const activities = ref<ListeningActivityManifest[]>([])
const loading = ref(false)
const error = ref('')

const activeActivity = ref<ListeningActivity | null>(null)
const phase = ref<'list' | 'listen' | 'exercises' | 'summary'>('list')
const exerciseIndex = ref(0)
const sessionResults = ref<ExerciseResult[]>([])
const playingAll = ref(false)
const playedOnce = ref(false)
const showTranscript = ref(false)

const currentExercise = computed(() =>
    activeActivity.value?.exercises[exerciseIndex.value] ?? null
)

const currentAnswered = computed(() =>
    sessionResults.value.length > exerciseIndex.value
)

const correctCount = computed(
    () => sessionResults.value.filter(result => result.correct).length
)

const hasLines = computed(() => (activeActivity.value?.lines.length ?? 0) > 0)

async function openActivity(manifest: ListeningActivityManifest) {
    loading.value = true
    error.value = ''

    try {
        activeActivity.value = await loadListeningActivity(manifest)
        phase.value = activeActivity.value.lines.length ? 'listen' : 'exercises'
        exerciseIndex.value = 0
        sessionResults.value = []
        playedOnce.value = false
        showTranscript.value = false
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load activity'
    } finally {
        loading.value = false
    }
}

async function playAll() {
    if (!activeActivity.value || playingAll.value) return

    playingAll.value = true

    for (const line of activeActivity.value.lines) {
        if (!playingAll.value) break

        await speakAsync(line.english, 'en-US', { rate: getSpeechRate() })

        if (!playingAll.value) break

        await new Promise(resolve => setTimeout(resolve, 600))
    }

    playingAll.value = false
    playedOnce.value = true
}

function stopPlayback() {
    playingAll.value = false
    stopSpeech()
}

function startQuestions() {
    stopPlayback()
    phase.value = 'exercises'
}

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    performanceStore.record({
        skill: 'listening',
        activityId: result.exerciseId,
        lessonId: activeActivity.value?.id ?? null,
        difficulty: currentExercise.value?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct
            ? []
            : [currentExercise.value?.type === 'dictation' ? 'spelling' : 'listening-detail'],
    })
}

function nextExercise() {
    if (!activeActivity.value) return

    if (exerciseIndex.value < activeActivity.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    phase.value = 'summary'
}

function backToList() {
    stopPlayback()
    activeActivity.value = null
    phase.value = 'list'
    sessionResults.value = []
    exerciseIndex.value = 0
}

onMounted(async () => {
    loading.value = true

    try {
        activities.value = (await loadListeningManifest()).activities
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load listening activities'
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

        <!-- LIST -->
        <div v-if="phase === 'list'">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900">Listening</h1>
                <p class="mt-2 text-gray-500">
                    Dialogues and dictation using the app's text-to-speech voices. Transcripts
                    stay hidden until after you answer.
                </p>
            </div>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading...</div>

            <div class="grid gap-3">
                <button
                    v-for="activity in activities"
                    :key="activity.id"
                    type="button"
                    class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    @click="openActivity(activity)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-900">{{ activity.title }}</p>
                        <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {{ activity.cefrLevel }}
                        </span>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">
                        {{ activity.kind }}
                        <span v-if="activity.estimatedDuration"> · ~{{ activity.estimatedDuration }} min</span>
                        <span v-if="activity.domainTags?.length"> · {{ activity.domainTags.join(', ') }}</span>
                    </p>
                </button>
            </div>
        </div>

        <!-- LISTEN -->
        <div v-else-if="phase === 'listen' && activeActivity">
            <button type="button" class="mb-6 text-sm text-gray-500 hover:text-black" @click="backToList">
                ← All activities
            </button>

            <h1 class="text-3xl font-bold text-gray-900">{{ activeActivity.title }}</h1>

            <div v-if="activeActivity.scenario" class="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p class="text-gray-700">{{ activeActivity.scenario }}</p>
                <p v-if="activeActivity.scenarioPersian" class="mt-2 text-sm text-gray-500" dir="rtl">
                    {{ activeActivity.scenarioPersian }}
                </p>
            </div>

            <div class="mt-6 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <div class="text-5xl">🎧</div>

                <button
                    v-if="!playingAll"
                    type="button"
                    class="mt-6 rounded-full bg-black px-8 py-4 text-lg font-semibold text-white hover:bg-gray-800"
                    @click="playAll"
                >
                    {{ playedOnce ? '▶ Listen again' : '▶ Play conversation' }}
                </button>

                <button
                    v-else
                    type="button"
                    class="mt-6 rounded-full border px-8 py-4 text-lg text-gray-600 hover:bg-gray-100"
                    @click="stopPlayback"
                >
                    ⏹ Stop
                </button>

                <p class="mt-4 text-xs text-gray-400">
                    The transcript is hidden until after the questions — train your ears first.
                </p>
            </div>

            <button
                type="button"
                class="mt-6 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                :disabled="hasLines && !playedOnce"
                @click="startQuestions"
            >
                Start questions ({{ activeActivity.exercises.length }})
            </button>
            <p v-if="hasLines && !playedOnce" class="mt-2 text-center text-xs text-gray-400">
                Listen to the conversation at least once first.
            </p>
        </div>

        <!-- EXERCISES -->
        <div v-else-if="phase === 'exercises' && activeActivity && currentExercise">
            <div class="mb-6 flex items-center justify-between text-sm text-gray-500">
                <span>{{ activeActivity.title }}</span>
                <span>{{ exerciseIndex + 1 }} / {{ activeActivity.exercises.length }}</span>
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
                    {{ exerciseIndex === activeActivity.exercises.length - 1 ? 'Finish' : 'Next' }}
                </button>
            </div>
        </div>

        <!-- SUMMARY -->
        <div v-else-if="phase === 'summary' && activeActivity">
            <div class="rounded-2xl border bg-white p-10 text-center shadow-sm">
                <div class="text-5xl">🎧</div>
                <h2 class="mt-4 text-2xl font-bold">
                    {{ correctCount }} / {{ sessionResults.length }} correct
                </h2>

                <div class="mt-8 flex justify-center gap-3">
                    <button
                        v-if="hasLines"
                        type="button"
                        class="rounded-xl border px-5 py-3 text-gray-600 hover:bg-gray-100"
                        @click="showTranscript = !showTranscript"
                    >
                        {{ showTranscript ? 'Hide transcript' : 'Show transcript' }}
                    </button>
                    <button
                        type="button"
                        class="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800"
                        @click="backToList"
                    >
                        All activities
                    </button>
                </div>
            </div>

            <div v-if="showTranscript && hasLines" class="mt-6 space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div v-for="(line, index) in activeActivity.lines" :key="index">
                    <p class="text-gray-800">
                        <span v-if="line.speaker" class="font-semibold">{{ line.speaker }}: </span>{{ line.english }}
                        <SpeechButton :text="line.english" lang="en-US" />
                    </p>
                    <p v-if="line.persian" class="mt-1 text-sm text-gray-500" dir="rtl">{{ line.persian }}</p>
                </div>
            </div>
        </div>
    </div>
</template>
