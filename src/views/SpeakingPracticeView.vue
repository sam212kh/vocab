<script setup lang="ts">
function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

import { computed, onMounted, ref } from 'vue'

import { useWordProgressStore } from '../stores/wordProgress'

import {
    loadLesson,
    loadManifest,
} from '../services/vocabulary'

import type {
    CourseManifest,
    LessonManifest,
    Word,
} from '../types/vocabulary'

import SpeechButton from '../components/ui/SpeechButton.vue'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import {
    checkPronunciation,
} from '../services/pronunciation'

const courses = ref<CourseManifest[]>([])

const selectedCourseId = ref('')
const selectedLessonId = ref('')

const words = ref<Word[]>([])
const lesson = ref<LessonManifest | null>(null)

const currentIndex = ref(0)

const loading = ref(false)
const error = ref('')

const pronunciationScore = ref<number | null>(null)
const pronunciationCorrect = ref(false)
const reviewMode = ref(false)
const wordProgressStore =
    useWordProgressStore()

const {
    isSupported,
    isListening,
    transcript,
    confidence,
    startListening,
    reset,
} = useSpeakingPractice()

const selectedCourse = computed(() => {
    return courses.value.find(
        course => course.id === selectedCourseId.value
    )
})

const availableLessons = computed(() => {
    return selectedCourse.value?.lessons ?? []
})

const currentWord = computed(() => {
    return words.value[currentIndex.value] ?? null
})

const currentProgress = computed(() => {
    if (!currentWord.value) {
        return null
    }

    return wordProgressStore.getProgress(
        currentWord.value.word
    )
})

const progress = computed(() => {
    if (!words.value.length) {
        return 0
    }

    return (
        ((currentIndex.value + 1) /
            words.value.length) *
        100
    )
})

async function loadSelectedLesson() {
    if (
        !selectedCourse.value ||
        !selectedLessonId.value
    ) {
        return
    }

    const selectedLesson =
        selectedCourse.value.lessons.find(
            item => item.id === selectedLessonId.value
        )

    if (!selectedLesson) {
        return
    }

    loading.value = true
    error.value = ''

    resetPractice()

    try {
        lesson.value = selectedLesson

        words.value = await loadLesson(
            selectedLesson
        )

        currentIndex.value = 0
    } catch (err) {
        console.error(err)

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function changeCourse() {
    resetPractice()

    selectedLessonId.value = ''
    lesson.value = null
    words.value = []
    currentIndex.value = 0
}

function resetPractice() {
    reset()

    pronunciationScore.value = null
    pronunciationCorrect.value = false
}
async function practiceWord() {
    if (
        !currentWord.value ||
        isListening.value
    ) {
        return
    }

    pronunciationScore.value = null
    pronunciationCorrect.value = false

    reset()

    await startListening()

    if (!transcript.value) {
        return
    }

    const result = checkPronunciation(
        currentWord.value.word,
        transcript.value
    )

    pronunciationScore.value =
        result.score

    pronunciationCorrect.value =
        result.correct

    if (result.correct) {
        wordProgressStore.recordCorrect(
            currentWord.value.word,
            selectedCourseId.value,
            selectedLessonId.value
        )

        await delay(1200)

        nextWord()
    } else {
        wordProgressStore.recordWrong(
            currentWord.value.word,
            selectedCourseId.value,
            selectedLessonId.value
        )
    }
}
function nextWord() {
    resetPractice()

    if (!words.value.length) {
        return
    }

    currentIndex.value =
        (currentIndex.value + 1) %
        words.value.length
}

function previousWord() {
    resetPractice()

    if (!words.value.length) {
        return
    }

    currentIndex.value =
        currentIndex.value === 0
            ? words.value.length - 1
            : currentIndex.value - 1
}

onMounted(async () => {
    try {
        const manifest = await loadManifest()

        courses.value = manifest.courses
    } catch (err) {
        console.error(err)

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load courses'
    }
})


const practiceWords = computed(() => {
    if (!reviewMode.value) {
        return words.value
    }

    return [...words.value].sort((a, b) => {
        const aProgress =
            wordProgressStore.getProgress(a.word)

        const bProgress =
            wordProgressStore.getProgress(b.word)

        return (
            bProgress.practicePriority -
            aProgress.practicePriority
        )
    })
})

</script>

<template>
    <div>
        <div class="mb-8">
            <h1 class="text-3xl font-bold">
                Speaking Practice
            </h1>

            <p class="mt-2 text-gray-500">
                Listen and practice pronunciation.
            </p>
        </div>

        <div
            v-if="error"
            class="mb-6 rounded-lg bg-red-50 p-4 text-red-600"
        >
            {{ error }}
        </div>

        <!-- Course / Lesson -->
        <button
            v-if="words.length"
            type="button"
            class="mb-6 rounded-lg border px-4 py-2 hover:bg-gray-50"
            @click="reviewMode = !reviewMode"
        >
            {{ reviewMode ? '📚 All Words' : '🔁 Review Weak Words' }}
        </button>
        <div
            class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
            <div>
                <label
                    class="mb-2 block text-sm font-medium"
                >
                    Course
                </label>

                <select
                    v-model="selectedCourseId"
                    class="w-full rounded-lg border bg-white px-4 py-3"
                    @change="changeCourse"
                >
                    <option value="">
                        Select a course
                    </option>

                    <option
                        v-for="course in courses"
                        :key="course.id"
                        :value="course.id"
                    >
                        {{ course.title }}
                    </option>
                </select>
            </div>

            <div>
                <label
                    class="mb-2 block text-sm font-medium"
                >
                    Lesson
                </label>

                <select
                    v-model="selectedLessonId"
                    class="w-full rounded-lg border bg-white px-4 py-3 disabled:bg-gray-100"
                    :disabled="!selectedCourseId"
                    @change="loadSelectedLesson"
                >
                    <option value="">
                        Select a lesson
                    </option>

                    <option
                        v-for="item in availableLessons"
                        :key="item.id"
                        :value="item.id"
                    >
                        {{ item.title }}
                    </option>
                </select>
            </div>
        </div>

        <div
            v-if="loading"
            class="py-12 text-center text-gray-500"
        >
            Loading lesson...
        </div>

        <div
            v-else-if="!isSupported"
            class="rounded-lg bg-yellow-50 p-4 text-yellow-700"
        >
            Speech recognition is not supported
            in this browser.
        </div>

        <div
            v-else-if="currentWord"
            class="mx-auto max-w-2xl"
        >
            <!-- Progress -->

            <div class="mb-6">
                <div
                    class="mb-2 flex items-center justify-between text-sm text-gray-500"
                >
                    <span>
                        Word {{ currentIndex + 1 }}
                        of
                        {{ words.length }}
                    </span>

                    <span>
                        {{ Math.round(progress) }}%
                    </span>
                </div>

                <div
                    class="h-2 overflow-hidden rounded-full bg-gray-200"
                >
                    <div
                        class="h-full rounded-full bg-black transition-all duration-300"
                        :style="{
                            width: `${progress}%`,
                        }"
                    />
                </div>
            </div>

            <!-- Word Card -->

            <div
                class="rounded-2xl border bg-white p-8 text-center shadow-sm"
            >
                <p class="text-sm text-gray-400">
                    {{ lesson?.title }}
                </p>

                <div
                    class="mt-6 flex items-center justify-center gap-3"
                >
                    <h2 class="text-4xl font-bold">
                        {{ currentWord.word }}
                    </h2>

                    <SpeechButton
                        :text="currentWord.word"
                        lang="en-US"
                        label="🔊"
                    />
                </div>

                <p class="mt-4 text-lg text-gray-600">
                    {{ currentWord.meaning }}
                </p>

                <!-- Word Progress -->

                <div
                    v-if="currentProgress"
                    class="mt-6 flex flex-wrap justify-center gap-2 text-xs"
                >
                    <span
                        class="rounded-full bg-gray-100 px-3 py-1"
                    >
                        {{ currentProgress.status }}
                    </span>

                    <span
                        class="rounded-full bg-gray-100 px-3 py-1"
                    >
                        ✓
                        {{ currentProgress.correctAnswers }}
                    </span>

                    <span
                        class="rounded-full bg-gray-100 px-3 py-1"
                    >
                        ✕
                        {{ currentProgress.wrongAnswers }}
                    </span>

                    <span
                        class="rounded-full bg-gray-100 px-3 py-1"
                    >
                        🔥
                        {{ currentProgress.streak }}
                    </span>
                </div>

                <!-- Speak -->

                <button
                    type="button"
                    class="mt-8 rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="isListening"
                    @click="practiceWord"
                >
                    {{
                        isListening
                            ? '🎙 Listening...'
                            : '🎙 Speak'
                    }}
                </button>

                <!-- Transcript -->

                <div
                    v-if="transcript"
                    class="mt-8 rounded-xl bg-gray-50 p-5"
                >
                    <p class="text-sm text-gray-400">
                        You said
                    </p>

                    <p
                        class="mt-2 text-xl font-medium"
                    >
                        {{ transcript }}
                    </p>

                    <p
                        class="mt-3 text-sm text-gray-500"
                    >
                        Recognition confidence:
                        {{
                            Math.round(
                                confidence * 100
                            )
                        }}%
                    </p>
                </div>

                <!-- Pronunciation Result -->

                <div
                    v-if="
                        pronunciationScore !== null
                    "
                    class="mt-6"
                >
                    <div
                        v-if="pronunciationCorrect"
                        class="rounded-xl bg-green-50 p-5 text-green-700"
                    >
                        <p
                            class="text-xl font-semibold"
                        >
                            ✓ Correct!
                        </p>

                        <p class="mt-2">
                            Pronunciation score:
                            {{ pronunciationScore }}%
                        </p>
                    </div>

                    <div
                        v-else
                        class="rounded-xl bg-orange-50 p-5 text-orange-700"
                    >
                        <p
                            class="text-xl font-semibold"
                        >
                            Try again
                        </p>

                        <p class="mt-2">
                            Pronunciation score:
                            {{ pronunciationScore }}%
                        </p>
                    </div>
                </div>

                <!-- Navigation -->

                <div
                    class="mt-8 flex flex-wrap justify-center gap-3"
                >
                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="previousWord"
                    >
                        ← Previous
                    </button>

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="resetPractice"
                    >
                        Try Again
                    </button>

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="nextWord"
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>

        <div
            v-else
            class="rounded-xl border border-dashed p-12 text-center text-gray-500"
        >
            Select a course and lesson to start.
        </div>
    </div>
</template>