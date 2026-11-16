<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import { answersMatch } from '../services/textMatch'
import { speakAsync, getSpeechRate } from '../services/speech'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'
import ActivityBar from '../components/practice/ActivityBar.vue'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import AnswerFeedback from '../components/practice/AnswerFeedback.vue'
import LessonPicker from '../components/practice/LessonPicker.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

const progressStore = useWordProgressStore()
const courses = ref<CourseManifest[]>([])
const selectedCourseId = ref('')
const selectedLessonId = ref('')
const words = ref<Word[]>([])
const index = ref(0)
const answer = ref('')
const revealed = ref(false)
const result = ref<'correct' | 'wrong' | null>(null)
const loading = ref(false)
const playing = ref(false)
const error = ref('')
const started = ref(false)
const score = ref(0)

const selectedCourse = computed(() =>
    courses.value.find(c => c.id === selectedCourseId.value)
)

const selectedLesson = computed<LessonManifest | null>(() =>
    selectedCourse.value?.lessons.find(l => l.id === selectedLessonId.value) ?? null
)

const availableLessons = computed(() => selectedCourse.value?.lessons ?? [])

const currentWord = computed(() => words.value[index.value] ?? null)
const finished = computed(() => started.value && index.value >= words.value.length)

function stripSense(word: string): string {
    return word.replace(/\s*\([^)]*\)/g, '').trim()
}

async function playCurrent() {
    if (!currentWord.value) return
    playing.value = true
    try {
        await speakAsync(stripSense(currentWord.value.word), 'en-US', { rate: getSpeechRate() })
    } finally {
        playing.value = false
    }
}

async function startListening() {
    if (!selectedLesson.value) return

    loading.value = true
    error.value = ''
    answer.value = ''
    revealed.value = false
    result.value = null
    score.value = 0
    started.value = false

    try {
        words.value = await loadLesson(selectedLesson.value)
        index.value = 0
        started.value = true
        await playCurrent()
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function checkAnswer() {
    if (!currentWord.value || revealed.value) return

    revealed.value = true
    result.value = answersMatch(stripSense(currentWord.value.word), answer.value) ? 'correct' : 'wrong'

    if (result.value === 'correct') {
        score.value++
        progressStore.recordCorrect(
            currentWord.value.word,
            currentWord.value.courseId,
            currentWord.value.lessonId
        )
    } else {
        progressStore.recordWrong(
            currentWord.value.word,
            currentWord.value.courseId,
            currentWord.value.lessonId
        )
    }
}

async function next() {
    if (!words.value.length) return
    index.value++
    answer.value = ''
    revealed.value = false
    result.value = null
    if (currentWord.value) {
        await playCurrent()
    }
}

function restart() {
    started.value = false
    words.value = []
    index.value = 0
    score.value = 0
}

const route = useRoute()

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses

        const queryCourseId = String(route.query.courseId ?? '')
        const queryLessonId = String(route.query.lessonId ?? '')

        const hasQueryCourse = courses.value.some(c => c.id === queryCourseId)

        selectedCourseId.value = hasQueryCourse
            ? queryCourseId
            : (courses.value[0]?.id ?? '')

        if (
            hasQueryCourse &&
            availableLessons.value.some(l => l.id === queryLessonId)
        ) {
            selectedLessonId.value = queryLessonId
            await startListening()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <ActivityPage eyebrow="Listening" title="Listen &amp; guess" description="Hear the word, then type what you heard. The text stays hidden until you answer." wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <LessonPicker
            v-if="!started"
            v-model:course-id="selectedCourseId"
            v-model:lesson-id="selectedLessonId"
            :courses="courses"
            :loading="loading"
            @start="startListening"
        />

        <ActivityResult
            v-else-if="finished"
            title="Listening practice complete"
            :score="score"
            :total="words.length"
            message="Your answers were added to your review progress."
            action-label="Practice another lesson"
            @action="restart"
        />

        <article v-else-if="currentWord" class="surface mx-auto max-w-2xl p-5 sm:p-7">
            <ActivityBar :current="index" :total="words.length" :score="score" />

            <div class="mt-8 flex flex-col items-center">
                <button
                    type="button"
                    class="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-white shadow-md transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:opacity-60"
                    :disabled="playing"
                    aria-label="Play the word"
                    @click="playCurrent"
                >
                    <AppIcon name="volume" :size="38" />
                </button>
                <p class="mt-3 text-sm text-gray-500">{{ playing ? 'Playing…' : 'Tap to hear it again' }}</p>
            </div>

            <form class="mt-7" @submit.prevent="revealed ? next() : (answer.trim() && checkAnswer())">
                <input
                    v-model="answer"
                    :disabled="revealed"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    dir="ltr"
                    aria-label="Type what you heard"
                    placeholder="Type what you heard…"
                    class="field !min-h-14 text-center text-xl"
                    :class="revealed ? (result === 'correct' ? '!border-green-600 !bg-green-50' : '!border-red-600 !bg-red-50') : ''"
                />

                <AnswerFeedback v-if="revealed" class="mt-4" :correct="result === 'correct'" :answer="currentWord.word">
                    <span class="fa-text" lang="fa">{{ currentWord.meaning }}</span>
                </AnswerFeedback>

                <div class="mt-5 flex gap-3">
                    <button v-if="!revealed" type="submit" class="btn-primary btn-lg flex-1" :disabled="!answer.trim()">Check</button>
                    <button v-else type="button" class="btn-primary btn-lg flex-1" @click="next">{{ index >= words.length - 1 ? 'See results' : 'Continue' }}</button>
                </div>
            </form>
        </article>
    </ActivityPage>
</template>
