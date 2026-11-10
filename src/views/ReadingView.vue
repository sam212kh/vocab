<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadReadingManifest, loadReadingPassage } from '../services/readingContent'
import { usePerformanceStore } from '../stores/performance'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'

import type { ReadingPassage, ReadingPassageManifest } from '../types/reading'
import type { ExerciseResult } from '../types/exercise'

const performanceStore = usePerformanceStore()

const passages = ref<ReadingPassageManifest[]>([])
const loading = ref(false)
const error = ref('')

const activeManifest = ref<ReadingPassageManifest | null>(null)
const activePassage = ref<ReadingPassage | null>(null)
const phase = ref<'list' | 'read' | 'exercises' | 'summary'>('list')
const exerciseIndex = ref(0)
const sessionResults = ref<ExerciseResult[]>([])

/*
 * Translations stay hidden until the learner has attempted the questions —
 * understanding comes first, translation is a post-attempt aid.
 */
const attempted = ref(false)
const showTranslation = ref(false)
const showVocabulary = ref(false)

const currentExercise = computed(() =>
    activePassage.value?.exercises[exerciseIndex.value] ?? null
)

const currentAnswered = computed(() =>
    sessionResults.value.length > exerciseIndex.value
)

const correctCount = computed(
    () => sessionResults.value.filter(result => result.correct).length
)

async function openPassage(manifest: ReadingPassageManifest) {
    loading.value = true
    error.value = ''

    try {
        activePassage.value = await loadReadingPassage(manifest)
        activeManifest.value = manifest
        phase.value = 'read'
        exerciseIndex.value = 0
        sessionResults.value = []
        attempted.value = false
        showTranslation.value = false
        showVocabulary.value = false
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load passage'
    } finally {
        loading.value = false
    }
}

function startQuestions() {
    attempted.value = true
    phase.value = 'exercises'
}

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    performanceStore.record({
        skill: 'reading',
        activityId: result.exerciseId,
        lessonId: activePassage.value?.id ?? null,
        difficulty: currentExercise.value?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['comprehension'],
    })
}

function nextExercise() {
    if (!activePassage.value) return

    if (exerciseIndex.value < activePassage.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    phase.value = 'summary'
}

function reviewPassage() {
    phase.value = 'read'
}

function backToList() {
    activePassage.value = null
    activeManifest.value = null
    phase.value = 'list'
    sessionResults.value = []
    exerciseIndex.value = 0
}

onMounted(async () => {
    loading.value = true

    try {
        passages.value = (await loadReadingManifest()).passages
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load reading list'
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
                <h1 class="text-3xl font-bold text-gray-900">Reading</h1>
                <p class="mt-2 text-gray-500">
                    Read first, then answer — translations unlock after you've tried.
                </p>
            </div>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading...</div>

            <div class="grid gap-3">
                <button
                    v-for="passage in passages"
                    :key="passage.id"
                    type="button"
                    class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    @click="openPassage(passage)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-900">{{ passage.title }}</p>
                        <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {{ passage.cefrLevel }}
                        </span>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">
                        {{ passage.kind }}
                        <span v-if="passage.estimatedReadingTime"> · ~{{ passage.estimatedReadingTime }} min read</span>
                        <span v-if="passage.domainTags?.length"> · {{ passage.domainTags.join(', ') }}</span>
                    </p>
                </button>
            </div>
        </div>

        <!-- READ -->
        <div v-else-if="phase === 'read' && activePassage">
            <button type="button" class="mb-6 text-sm text-gray-500 hover:text-black" @click="backToList">
                ← All passages
            </button>

            <h1 class="text-3xl font-bold text-gray-900">{{ activePassage.title }}</h1>

            <div class="mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div v-for="(paragraph, index) in activePassage.paragraphs" :key="index">
                    <p class="leading-relaxed text-gray-800">
                        <span v-if="paragraph.speaker" class="font-semibold">{{ paragraph.speaker }}: </span>{{ paragraph.english }}
                        <SpeechButton :text="paragraph.english" lang="en-US" />
                    </p>
                    <p
                        v-if="showTranslation && paragraph.persian"
                        class="mt-1 rounded-lg bg-gray-50 p-2 text-sm text-gray-600"
                        dir="rtl"
                    >
                        {{ paragraph.persian }}
                    </p>
                </div>
            </div>

            <!-- Vocabulary (collapsible, available before attempting — it's a reading aid, not a translation) -->
            <div class="mt-4">
                <button
                    type="button"
                    class="text-sm font-medium text-gray-600 hover:text-black"
                    @click="showVocabulary = !showVocabulary"
                >
                    {{ showVocabulary ? '▾' : '▸' }} Key vocabulary ({{ activePassage.vocabulary.length }})
                </button>

                <div v-if="showVocabulary" class="mt-2 space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div
                        v-for="item in activePassage.vocabulary"
                        :key="item.word"
                        class="flex items-baseline justify-between gap-3 text-sm"
                    >
                        <span class="font-semibold text-gray-900">{{ item.word }}</span>
                        <span class="text-gray-500">{{ item.meaning }}</span>
                        <span v-if="item.persian" class="text-gray-500" dir="rtl">{{ item.persian }}</span>
                    </div>
                </div>
            </div>

            <div class="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    class="flex-1 rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="startQuestions"
                >
                    {{ attempted ? 'Back to questions' : `Start questions (${activePassage.exercises.length})` }}
                </button>

                <button
                    v-if="attempted"
                    type="button"
                    class="rounded-xl border px-6 py-3 text-gray-600 hover:bg-gray-100"
                    @click="showTranslation = !showTranslation"
                >
                    {{ showTranslation ? 'Hide translation' : 'Show translation' }}
                </button>
            </div>

            <p v-if="!attempted" class="mt-3 text-center text-xs text-gray-400">
                The Persian translation unlocks after your first attempt at the questions.
            </p>
        </div>

        <!-- EXERCISES -->
        <div v-else-if="phase === 'exercises' && activePassage && currentExercise">
            <div class="mb-6 flex items-center justify-between text-sm text-gray-500">
                <button type="button" class="hover:text-black" @click="reviewPassage">
                    ← Re-read passage
                </button>
                <span>{{ exerciseIndex + 1 }} / {{ activePassage.exercises.length }}</span>
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
                    {{ exerciseIndex === activePassage.exercises.length - 1 ? 'Finish' : 'Next' }}
                </button>
            </div>
        </div>

        <!-- SUMMARY -->
        <div v-else-if="phase === 'summary' && activePassage" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div class="text-5xl">📖</div>
            <h2 class="mt-4 text-2xl font-bold">
                {{ correctCount }} / {{ sessionResults.length }} correct
            </h2>
            <p class="mt-2 text-gray-500">
                You can now re-read the passage with the Persian translation visible.
            </p>
            <div class="mt-8 flex justify-center gap-3">
                <button
                    type="button"
                    class="rounded-xl border px-5 py-3 text-gray-600 hover:bg-gray-100"
                    @click="showTranslation = true; reviewPassage()"
                >
                    Re-read with translation
                </button>
                <button
                    type="button"
                    class="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="backToList"
                >
                    All passages
                </button>
            </div>
        </div>
    </div>
</template>
