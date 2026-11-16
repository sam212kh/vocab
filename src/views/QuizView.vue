<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'
import SpeechButton from "../components/ui/SpeechButton.vue";
import ActivityBar from '../components/practice/ActivityBar.vue'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import AnswerFeedback from '../components/practice/AnswerFeedback.vue'
import LessonPicker from '../components/practice/LessonPicker.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

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

const route = useRoute()

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses

        const queryCourseId = String(route.query.courseId ?? '')
        const queryLessonId = String(route.query.lessonId ?? '')

        const hasQueryCourse = courses.value.some(c => c.id === queryCourseId)

        courseId.value = hasQueryCourse
            ? queryCourseId
            : (courses.value[0]?.id ?? '')

        if (
            hasQueryCourse &&
            lessons.value.some(l => l.id === queryLessonId)
        ) {
            lessonId.value = queryLessonId
            await startQuiz()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <ActivityPage eyebrow="Quiz" title="Vocabulary quiz" description="Choose a lesson and test your recall.">
        <StateBlock v-if="error" kind="error" :text="error" />

        <LessonPicker
            v-if="!started"
            v-model:course-id="courseId"
            v-model:lesson-id="lessonId"
            :courses="courses"
            :loading="loading"
            start-label="Start quiz"
            @start="startQuiz"
        />

        <ActivityResult
            v-else-if="finished"
            title="Quiz complete"
            :score="score"
            :total="questions.length"
            message="Your answers were added to your review progress."
            action-label="Try another quiz"
            @action="restart"
        />

        <article v-else-if="current" class="surface p-5 sm:p-7">
            <ActivityBar :current="questionIndex" :total="questions.length" :score="score" />

            <div class="mt-8 text-center">
                <p class="eyebrow">Choose the correct meaning</p>
                <h2 class="wrap-anywhere mt-3 inline-flex flex-wrap items-center justify-center gap-1 text-4xl font-bold tracking-tight text-gray-900" dir="ltr" lang="en">
                    {{ current.prompt }}
                    <AudioPlayer :text="current.prompt" size="md" :label="current.prompt" tone="practice" />
                </h2>
            </div>

            <div class="mt-7 grid gap-3">
                <button
                    v-for="option in current.options"
                    :key="option"
                    type="button"
                    class="choice"
                    :class="{
                        'choice-correct': selected !== null && option === current.answer,
                        'choice-wrong': selected === option && option !== current.answer,
                    }"
                    :disabled="selected !== null"
                    dir="auto"
                    @click="choose(option)"
                >
                    {{ option }}
                </button>
            </div>

            <button v-if="selected !== null" type="button" class="btn-primary btn-lg mt-6 w-full" @click="next">
                {{ questionIndex === questions.length - 1 ? 'Finish' : 'Next' }}
            </button>
        </article>
    </ActivityPage>
</template>
