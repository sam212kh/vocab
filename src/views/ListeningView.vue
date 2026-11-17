<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadListeningManifest, loadListeningActivity } from '../services/listeningContent'
import { usePerformanceStore } from '../stores/performance'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'
import { speakAsync, stop as stopSpeech, getSpeechRate } from '../services/speech'


import type { ListeningActivity, ListeningActivityManifest } from '../types/listening'
import type { ExerciseResult } from '../types/exercise'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import ExerciseSession from '../components/practice/ExerciseSession.vue'
import ItemList from '../components/practice/ItemList.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

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

const evidenceRecorder = useEvidenceRecorder()

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    const exercise = currentExercise.value

    if (exercise && activeActivity.value) evidenceRecorder.recordExercise(exercise, result, `listening/${activeActivity.value.id}`)

    /* A hint-assisted answer is practice, not evidence of the skill. */
    if (result.hintUsed) return

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
    <ActivityPage eyebrow="Listening" title="Listening" description="Dialogues and dictation in the app's voices. Transcripts stay hidden until you have answered." wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <!-- LIST -->
        <template v-if="phase === 'list'">
            <StateBlock v-if="loading" kind="loading" title="Loading activities" :rows="4" />
            <ItemList
                v-else
                :items="activities.map(activity => ({
                    id: activity.id,
                    title: activity.title,
                    badge: activity.cefrLevel ? { text: activity.cefrLevel, tone: 'neutral' } : null,
                    meta: [activity.kind, activity.estimatedDuration ? `~${activity.estimatedDuration} min` : '', activity.domainTags?.join(', ')].filter(Boolean).join(' · '),
                }))"
                @open="id => openActivity(activities.find(activity => activity.id === id)!)"
            />
        </template>

        <!-- LISTEN -->
        <div v-else-if="phase === 'listen' && activeActivity" class="space-y-5">
            <button type="button" class="btn-ghost -ml-3" @click="backToList"><AppIcon name="arrow-left" :size="16" /> All activities</button>

            <article class="surface p-5 sm:p-8">
                <h2 class="font-display text-2xl font-semibold text-gray-900 sm:text-3xl">{{ activeActivity.title }}</h2>

                <div v-if="activeActivity.scenario" class="mt-4">
                    <p class="text-gray-700" dir="ltr" lang="en">{{ activeActivity.scenario }}</p>
                    <p v-if="activeActivity.scenarioPersian" class="fa-text mt-1 text-sm text-gray-500" lang="fa">{{ activeActivity.scenarioPersian }}</p>
                </div>

                <div class="mt-7 flex flex-col items-center rounded-2xl bg-accent-soft px-4 py-8 text-center">
                    <button
                        v-if="!playingAll"
                        type="button"
                        class="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-md transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                        :aria-label="playedOnce ? 'Listen again' : 'Play the conversation'"
                        @click="playAll"
                    ><AppIcon name="play" :size="32" /></button>
                    <button
                        v-else
                        type="button"
                        class="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-white text-accent shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                        aria-label="Stop"
                        @click="stopPlayback"
                    ><AppIcon name="stop" :size="30" /></button>
                    <p class="mt-3 font-semibold text-gray-900">{{ playingAll ? 'Playing…' : playedOnce ? 'Listen again' : 'Play the conversation' }}</p>
                    <p class="mt-1 text-xs text-gray-500">The transcript stays hidden until after the questions. Train your ears first.</p>
                </div>
            </article>

            <button type="button" class="btn-primary btn-lg w-full" :disabled="hasLines && !playedOnce" @click="startQuestions">
                Start questions ({{ activeActivity.exercises.length }})
            </button>
            <p v-if="hasLines && !playedOnce" class="text-center text-xs text-gray-400">Listen to the conversation at least once first.</p>
        </div>

        <!-- EXERCISES -->
        <ExerciseSession
            v-else-if="phase === 'exercises' && activeActivity && currentExercise"
            :exercise="currentExercise"
            :index="exerciseIndex"
            :total="activeActivity.exercises.length"
            :answered="currentAnswered"
            :title="activeActivity.title"
            @result="onExerciseResult"
            @next="nextExercise"
        />

        <!-- SUMMARY -->
        <template v-else-if="phase === 'summary' && activeActivity">
            <ActivityResult
                title="Listening complete"
                :score="correctCount"
                :total="sessionResults.length"
                action-label="All activities"
                @action="backToList"
            >
                <template v-if="hasLines" #secondary>
                    <button type="button" class="btn-secondary btn-lg" @click="showTranscript = !showTranscript">{{ showTranscript ? 'Hide transcript' : 'Show transcript' }}</button>
                </template>
            </ActivityResult>

            <section v-if="showTranscript && hasLines" class="surface divide-y divide-gray-100">
                <h3 class="label px-5 pb-1 pt-4">Transcript</h3>
                <div v-for="(line, index) in activeActivity.lines" :key="index" class="flex items-start gap-3 px-5 py-3">
                    <div class="min-w-0 flex-1">
                        <p class="text-gray-900" dir="ltr" lang="en"><span v-if="line.speaker" class="mr-1 text-sm font-semibold text-accent-ink">{{ line.speaker }}</span>{{ line.english }}</p>
                        <p v-if="line.persian" class="fa-text text-sm text-gray-500" lang="fa">{{ line.persian }}</p>
                    </div>
                    <AudioPlayer :text="line.english" size="sm" tone="practice" :label="line.english" />
                </div>
            </section>
        </template>
    </ActivityPage>
</template>
