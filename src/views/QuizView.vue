<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'
import SpeechButton from "../components/ui/SpeechButton.vue";

interface Question {
    word: Word
    prompt: string
    options: string[]
    answer: string
}

const progressStore = useWordProgressStore()
const courses = ref<CourseManifest[]>([])
const courseId = ref('')
const lessonId = ref('')
const questions = ref<Question[]>([])
const questionIndex = ref(0)
const selected = ref<string | null>(null)
const score = ref(0)
const loading = ref(false)
const started = ref(false)
const error = ref('')

const course = computed(() => courses.value.find(c => c.id === courseId.value))
const lessons = computed(() => course.value?.lessons ?? [])
const current = computed(() => questions.value[questionIndex.value] ?? null)
const finished = computed(() => started.value && questionIndex.value >= questions.value.length)

function shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5)
}

async function startQuiz() {
    const lesson = lessons.value.find(l => l.id === lessonId.value)
    if (!lesson) return

    loading.value = true
    error.value = ''

    try {
        const words = await loadLesson(lesson)
        const pool = shuffle(words).slice(0, Math.min(10, words.length))

        questions.value = pool.map(word => {
            const distractors = shuffle(
                words.filter(item => item.word !== word.word)
            )
                .slice(0, 3)
                .map(item => item.meaning)

            const answer = word.meaning

            return {
                word,
                prompt: word.word,
                options: shuffle([answer, ...distractors]),
                answer,
            }
        })

        questionIndex.value = 0
        score.value = 0
        selected.value = null
        started.value = true
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to start quiz'
    } finally {
        loading.value = false
    }
}

function choose(option: string) {
    if (!current.value || selected.value !== null) return

    selected.value = option

    if (option === current.value.answer) {
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
    if (selected.value === null) return
    questionIndex.value++
    selected.value = null
}

function restart() {
    started.value = false
    questions.value = []
    selected.value = null
}

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses
        courseId.value = courses.value[0]?.id ?? ''
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <section class="mx-auto max-w-3xl">
        <div class="mb-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-gray-500">Quiz</p>
            <h1 class="mt-1 text-3xl font-bold">Vocabulary quiz</h1>
            <p class="mt-2 text-gray-500">Choose a lesson and test your recall.</p>
        </div>

        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <div v-if="!started" class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="grid gap-4 md:grid-cols-2">
                <label class="text-sm font-medium">
                    Course
                    <select v-model="courseId" class="mt-2 w-full rounded-lg border px-3 py-2" @change="lessonId = ''">
                        <option v-for="item in courses" :key="item.id" :value="item.id">
                            {{ item.title }}
                        </option>
                    </select>
                </label>

                <label class="text-sm font-medium">
                    Lesson
                    <select v-model="lessonId" class="mt-2 w-full rounded-lg border px-3 py-2">
                        <option value="">Select a lesson</option>
                        <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">
                            {{ lesson.title }}
                        </option>
                    </select>
                </label>
            </div>

            <button
                type="button"
                class="mt-5 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                :disabled="loading || !lessonId"
                @click="startQuiz"
            >
                {{ loading ? 'Loading...' : 'Start quiz' }}
            </button>
        </div>

        <div v-else-if="finished" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p class="text-sm text-gray-500">Quiz complete</p>
            <h2 class="mt-2 text-4xl font-bold">{{ score }} / {{ questions.length }}</h2>
            <p class="mt-3 text-gray-500">Your answers were added to your review progress.</p>
            <button type="button" class="mt-6 rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white" @click="restart">
                Try another quiz
            </button>
        </div>

        <article v-else-if="current" class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="flex justify-between text-sm text-gray-500">
                <span>Question {{ questionIndex + 1 }} / {{ questions.length }}</span>
                <span>Score: {{ score }}</span>
            </div>

            <h2 class="mt-10 text-center text-4xl font-bold">{{ current.prompt }} <SpeechButton
                :text="current.prompt"
                lang="en-US"
            /> </h2>
            <p class="mt-2 text-center text-gray-500">Choose the correct meaning.</p>

            <div class="mt-8 grid gap-3">
                <button
                    v-for="option in current.options"
                    :key="option"
                    type="button"
                    class="rounded-xl border p-4 text-left transition"
                    :class="{
                        'border-green-500 bg-green-50': selected && option === current.answer,
                        'border-red-500 bg-red-50': selected === option && option !== current.answer,
                        'hover:bg-gray-50': selected === null,
                    }"
                    @click="choose(option)"
                >
                    {{ option }}
                </button>
            </div>

            <button
                v-if="selected !== null"
                type="button"
                class="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white"
                @click="next"
            >
                {{ questionIndex === questions.length - 1 ? 'Finish' : 'Next' }}
            </button>
        </article>
    </section>
</template>
