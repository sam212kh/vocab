<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadReadingManifest, loadReadingPassage } from '../services/readingContent'
import { usePerformanceStore } from '../stores/performance'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'


import type { ReadingPassage, ReadingPassageManifest } from '../types/reading'
import type { ExerciseResult } from '../types/exercise'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import ExerciseSession from '../components/practice/ExerciseSession.vue'
import ItemList from '../components/practice/ItemList.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

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

const evidenceRecorder = useEvidenceRecorder()

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    const exercise = currentExercise.value

    if (exercise && activePassage.value) evidenceRecorder.recordExercise(exercise, result, `reading/${activePassage.value.id}`)

    /* A hint-assisted answer is practice, not evidence of the skill. */
    if (result.hintUsed) return

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
    <ActivityPage eyebrow="Reading" title="Reading" description="Read first, then answer. Translations unlock after you have tried." wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <!-- LIST -->
        <template v-if="phase === 'list'">
            <StateBlock v-if="loading" kind="loading" title="Loading passages" :rows="4" />
            <ItemList
                v-else
                :items="passages.map(passage => ({
                    id: passage.id,
                    title: passage.title,
                    badge: passage.cefrLevel ? { text: passage.cefrLevel, tone: 'neutral' } : null,
                    meta: [passage.kind, passage.estimatedReadingTime ? `~${passage.estimatedReadingTime} min read` : '', passage.domainTags?.join(', ')].filter(Boolean).join(' · '),
                }))"
                @open="id => openPassage(passages.find(passage => passage.id === id)!)"
            />
        </template>

        <!-- READ -->
        <div v-else-if="phase === 'read' && activePassage" class="space-y-5">
            <button type="button" class="btn-ghost -ml-3" @click="backToList"><AppIcon name="arrow-left" :size="16" /> All passages</button>

            <article class="surface p-5 sm:p-8">
                <h2 class="font-display text-2xl font-semibold text-gray-900 sm:text-3xl">{{ activePassage.title }}</h2>

                <div class="mt-5 space-y-5">
                    <div v-for="(paragraph, index) in activePassage.paragraphs" :key="index">
                        <div class="flex items-start gap-2">
                            <p class="wrap-anywhere min-w-0 flex-1 font-display text-[1.12rem] leading-8 text-gray-800 sm:text-[1.2rem] sm:leading-9" dir="ltr" lang="en">
                                <span v-if="paragraph.speaker" class="mr-2 font-sans text-sm font-semibold uppercase tracking-wide text-accent-ink">{{ paragraph.speaker }}</span>{{ paragraph.english }}
                            </p>
                            <AudioPlayer :text="paragraph.english" size="sm" tone="practice" label="Read aloud" class="shrink-0" />
                        </div>
                        <p v-if="showTranslation && paragraph.persian" class="fa-text mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-600" lang="fa">{{ paragraph.persian }}</p>
                    </div>
                </div>
            </article>

            <section v-if="activePassage.vocabulary.length" class="surface">
                <button type="button" class="flex min-h-12 w-full items-center gap-2 px-5 text-left text-sm font-semibold text-gray-700" :aria-expanded="showVocabulary" @click="showVocabulary = !showVocabulary">
                    Key vocabulary ({{ activePassage.vocabulary.length }})
                    <AppIcon name="chevron-down" :size="16" class="ml-auto text-gray-400 transition-transform" :class="showVocabulary ? 'rotate-180' : ''" />
                </button>
                <ul v-if="showVocabulary" class="divide-y divide-gray-100 border-t border-gray-100 px-5">
                    <li v-for="item in activePassage.vocabulary" :key="item.word" class="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-sm">
                        <span class="font-semibold text-gray-900" dir="ltr">{{ item.word }}</span>
                        <span class="text-gray-500">{{ item.meaning }}</span>
                        <span v-if="item.persian" class="fa-text text-gray-500" lang="fa">{{ item.persian }}</span>
                    </li>
                </ul>
            </section>

            <div class="flex flex-col gap-3 sm:flex-row">
                <button type="button" class="btn-primary btn-lg flex-1" @click="startQuestions">
                    {{ attempted ? 'Back to questions' : `Start questions (${activePassage.exercises.length})` }}
                </button>
                <button v-if="attempted" type="button" class="btn-secondary btn-lg" @click="showTranslation = !showTranslation">
                    {{ showTranslation ? 'Hide translation' : 'Show translation' }}
                </button>
            </div>
            <p v-if="!attempted" class="text-center text-xs text-gray-400">The Persian translation unlocks after your first attempt at the questions.</p>
        </div>

        <!-- EXERCISES -->
        <ExerciseSession
            v-else-if="phase === 'exercises' && activePassage && currentExercise"
            :exercise="currentExercise"
            :index="exerciseIndex"
            :total="activePassage.exercises.length"
            :answered="currentAnswered"
            :title="activePassage.title"
            @result="onExerciseResult"
            @next="nextExercise"
        >
            <template #footer>
                <button type="button" class="btn-ghost -ml-3" @click="reviewPassage"><AppIcon name="arrow-left" :size="16" /> Re-read the passage</button>
            </template>
        </ExerciseSession>

        <!-- SUMMARY -->
        <ActivityResult
            v-else-if="phase === 'summary' && activePassage"
            title="Reading complete"
            :score="correctCount"
            :total="sessionResults.length"
            message="You can now re-read the passage with the Persian translation visible."
            action-label="All passages"
            @action="backToList"
        >
            <template #secondary>
                <button type="button" class="btn-secondary btn-lg" @click="showTranslation = true; reviewPassage()">Re-read with translation</button>
            </template>
        </ActivityResult>
    </ActivityPage>
</template>
