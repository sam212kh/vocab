<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import { answersMatch } from '../services/textMatch'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'

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
const error = ref('')
const started = ref(false)
const score = ref(0)

const selectedCourse = computed(() =>
    courses.value.find(c => c.id === selectedCourseId.value)
)

const currentWord = computed(() => words.value[index.value] ?? null)

const finished = computed(() => started.value && index.value >= words.value.length)

const selectedLesson = computed<LessonManifest | null>(() =>
    selectedCourse.value?.lessons.find(l => l.id === selectedLessonId.value) ?? null
)

const availableLessons = computed(() => selectedCourse.value?.lessons ?? [])

async function startPractice() {
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
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function checkAnswer() {
    if (!currentWord.value || revealed.value) return

    revealed.value = true
    result.value = answersMatch(currentWord.value.word, answer.value) ? 'correct' : 'wrong'

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

function next() {
    if (!words.value.length) return
    index.value++
    answer.value = ''
    revealed.value = false
    result.value = null
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
            await startPractice()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <section class="mx-auto max-w-4xl">
        <div class="mb-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-gray-500">Practice</p>
            <h1 class="mt-1 text-3xl font-bold">Active recall</h1>
            <p class="mt-2 text-gray-500">
                See the meaning and produce the English word from memory.
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
                @click="startPractice"
            >
                {{ loading ? 'Loading...' : 'Start practice' }}
            </button>
        </div>

        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <div v-if="finished" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p class="text-sm text-gray-500">Practice complete</p>
            <h2 class="mt-2 text-4xl font-bold">{{ score }} / {{ words.length }}</h2>
            <p class="mt-3 text-gray-500">Your answers were added to your review progress.</p>
            <button
                type="button"
                class="mt-6 rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
                @click="restart"
            >
                Practice another lesson
            </button>
        </div>

        <article v-else-if="currentWord" class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between text-sm text-gray-500">
                <span>{{ index + 1 }} / {{ words.length }}</span>
                <span>Score: {{ score }}</span>
                <span>{{ currentWord.pos }}</span>
            </div>

            <div class="mt-10 text-center">
                <p class="text-sm text-gray-500">Translate this meaning into English:</p>
                <h2 class="mt-3 text-3xl font-bold">{{ currentWord.meaning }}</h2>
            </div>

            <form class="mt-8" @submit.prevent="checkAnswer">
                <input
                    v-model="answer"
                    :disabled="revealed"
                    autofocus
                    autocomplete="off"
                    placeholder="Type the English word..."
                    class="w-full rounded-xl border px-4 py-4 text-center text-xl outline-none focus:border-gray-900"
                />

                <div v-if="revealed" class="mt-4 rounded-xl p-4 text-center" :class="result === 'correct' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'">
                    <strong>{{ result === 'correct' ? 'Correct!' : 'Not quite.' }}</strong>
                    <div v-if="result === 'wrong'" class="mt-1">
                        Correct answer: <strong>{{ currentWord.word }}</strong>
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
                        Next word
                    </button>
                </div>
            </form>
        </article>
    </section>
</template>
