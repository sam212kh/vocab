<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import { answersMatch } from '../services/textMatch'
import SpeechButton from '../components/ui/SpeechButton.vue'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'

interface ClozeQuestion {
    word: Word
    before: string
    blank: string
    after: string
    persian: string
}

const progressStore = useWordProgressStore()
const courses = ref<CourseManifest[]>([])
const selectedCourseId = ref('')
const selectedLessonId = ref('')
const questions = ref<ClozeQuestion[]>([])
const index = ref(0)
const answer = ref('')
const revealed = ref(false)
const result = ref<'correct' | 'wrong' | null>(null)
const loading = ref(false)
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

const current = computed(() => questions.value[index.value] ?? null)
const finished = computed(() => started.value && index.value >= questions.value.length)

function stripSense(word: string): string {
    return word.replace(/\s*\([^)]*\)/g, '').trim()
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildQuestion(word: Word): ClozeQuestion | null {
    const headword = stripSense(word.word)
    if (!headword) return null

    for (const example of word.examples) {
        if (!example.english) continue

        const pattern = new RegExp(`\\b${escapeRegExp(headword)}\\b`, 'i')
        const match = pattern.exec(example.english)

        if (match) {
            return {
                word,
                before: example.english.slice(0, match.index),
                blank: match[0],
                after: example.english.slice(match.index + match[0].length),
                persian: example.persian,
            }
        }
    }

    return null
}

async function startCloze() {
    if (!selectedLesson.value) return

    loading.value = true
    error.value = ''
    answer.value = ''
    revealed.value = false
    result.value = null
    score.value = 0
    started.value = false

    try {
        const words = await loadLesson(selectedLesson.value)

        questions.value = words
            .map(buildQuestion)
            .filter((q): q is ClozeQuestion => q !== null)

        index.value = 0
        started.value = true
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function checkAnswer() {
    if (!current.value || revealed.value) return

    revealed.value = true
    result.value = answersMatch(current.value.blank, answer.value) ? 'correct' : 'wrong'

    if (result.value === 'correct') {
        score.value++
        progressStore.recordCorrect(
            current.value.word.word,
            current.value.word.courseId,
            current.value.word.lessonId
        )
    } else {
        progressStore.recordWrong(
            current.value.word.word,
            current.value.word.courseId,
            current.value.word.lessonId
        )
    }
}

function next() {
    if (!questions.value.length) return
    index.value++
    answer.value = ''
    revealed.value = false
    result.value = null
}

function restart() {
    started.value = false
    questions.value = []
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
            await startCloze()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <section class="mx-auto max-w-4xl">
        <div class="mb-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-gray-500">Cloze</p>
            <h1 class="mt-1 text-3xl font-bold">Fill in the blank</h1>
            <p class="mt-2 text-gray-500">
                Read the real sentence, figure out the missing word from context.
            </p>
        </div>

        <div class="mb-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
            <label class="text-sm font-medium">
                Course
                <select
                    v-model="selectedCourseId"
                    class="mt-2 w-full rounded-lg border px-3 py-2"
                    @change="selectedLessonId = ''"
                >
                    <option v-for="course in courses" :key="course.id" :value="course.id">
                        {{ course.title }}
                    </option>
                </select>
            </label>

            <label class="text-sm font-medium">
                Lesson
                <select v-model="selectedLessonId" class="mt-2 w-full rounded-lg border px-3 py-2">
                    <option value="">Select a lesson</option>
                    <option v-for="lesson in availableLessons" :key="lesson.id" :value="lesson.id">
                        {{ lesson.title }}
                    </option>
                </select>
            </label>

            <button
                type="button"
                class="rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 md:col-span-2"
                :disabled="loading || !selectedLessonId"
                @click="startCloze"
            >
                {{ loading ? 'Loading...' : 'Start' }}
            </button>
        </div>

        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <div
            v-if="started && !questions.length && !loading"
            class="rounded-2xl border bg-white p-8 text-center text-gray-500"
        >
            No sentences in this lesson matched a single target word well enough for a
            cloze exercise — try another lesson.
        </div>

        <div v-if="finished" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p class="text-sm text-gray-500">Cloze complete</p>
            <h2 class="mt-2 text-4xl font-bold">{{ score }} / {{ questions.length }}</h2>
            <p class="mt-3 text-gray-500">Your answers were added to your review progress.</p>
            <button
                type="button"
                class="mt-6 rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
                @click="restart"
            >
                Practice another lesson
            </button>
        </div>

        <article v-else-if="current" class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between text-sm text-gray-500">
                <span>{{ index + 1 }} / {{ questions.length }}</span>
                <span>Score: {{ score }}</span>
            </div>

            <div class="mt-10 text-center">
                <p class="text-sm text-gray-500">Complete the sentence:</p>
                <p class="mt-4 text-2xl leading-10">
                    {{ current.before }}<span
                        class="inline-block min-w-[6rem] border-b-2 border-gray-900 px-1 text-center font-semibold"
                    >{{ revealed ? current.blank : '_____' }}</span>{{ current.after }}
                </p>
                <p class="mt-3 text-sm text-gray-500">{{ current.persian }}</p>
            </div>

            <form class="mt-8" @submit.prevent="checkAnswer">
                <input
                    v-model="answer"
                    :disabled="revealed"
                    autofocus
                    autocomplete="off"
                    placeholder="Type the missing word..."
                    class="w-full rounded-xl border px-4 py-4 text-center text-xl outline-none focus:border-gray-900"
                />

                <div
                    v-if="revealed"
                    class="mt-4 rounded-xl p-4 text-center"
                    :class="result === 'correct' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
                >
                    <strong>{{ result === 'correct' ? 'Correct!' : 'Not quite.' }}</strong>
                    <div v-if="result === 'wrong'" class="mt-1">
                        Correct answer: <strong>{{ current.blank }}</strong>
                    </div>
                    <div class="mt-2">
                        <SpeechButton :text="current.before + current.blank + current.after" lang="en-US" />
                    </div>
                </div>

                <div class="mt-5 flex gap-3">
                    <button
                        v-if="!revealed"
                        type="submit"
                        class="flex-1 rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700"
                    >
                        Check answer
                    </button>
                    <button
                        v-else
                        type="button"
                        class="flex-1 rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700"
                        @click="next"
                    >
                        Next
                    </button>
                </div>
            </form>
        </article>
    </section>
</template>
