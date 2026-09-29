<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
    loadLesson,
    loadManifest,
} from '../services/vocabulary'

import type {
    CourseManifest,
    LessonManifest,
    Word,
} from '../types/vocabulary'

import { useListenRepeat } from '../composables/useListenRepeat'

const courses = ref<CourseManifest[]>([])

const selectedCourseId = ref('')
const selectedLessonId = ref('')

const words = ref<Word[]>([])
const lesson = ref<LessonManifest | null>(null)

const loading = ref(false)
const error = ref('')

const {
    currentIndex,
    currentNumber,
    total,
    progressPercent,
    repeatCount,
    playbackStep,
    isPlaying,
    start,
    stop,
    next,
    previous,
    repeatCurrent,
    reset,
} = useListenRepeat(words)


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

async function loadSelectedLesson() {
    if (!selectedCourse.value || !selectedLessonId.value) {
        return
    }

    const selectedLesson =
        selectedCourse.value.lessons.find(
            item => item.id === selectedLessonId.value
        )

    if (!selectedLesson) {
        return
    }

    stop()

    loading.value = true
    error.value = ''

    try {
        lesson.value = selectedLesson

        words.value = await loadLesson(
            selectedLesson
        )
        reset()

    } catch (err) {
        console.error('Failed to load lesson:', err)

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function changeCourse() {
    stop()

    selectedLessonId.value = ''
    lesson.value = null
    words.value = []
}

onMounted(async () => {
    try {
        const manifest = await loadManifest()

        courses.value = manifest.courses
    } catch (err) {
        console.error(err)

        error.value =
            'Failed to load courses'
    }
})
</script>

<template>
    <div
        v-if="words.length"
        class="mb-6"
    >
        <div class="mb-2 flex items-center justify-between text-sm text-gray-500">
        <span>
            Word {{ currentNumber }} of {{ total }}
        </span>

            <span>
            {{ Math.round(progressPercent) }}%
        </span>
        </div>

        <div class="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
                class="h-full rounded-full bg-black transition-all duration-300"
                :style="{ width: `${progressPercent}%` }"
            />
        </div>
    </div>
    <div>
        <div class="mb-8">
            <h1 class="text-3xl font-bold">
                Listen & Repeat
            </h1>

            <p class="mt-2 text-gray-500">
                Listen to each word three times and repeat it.
            </p>
        </div>

        <div
            v-if="error"
            class="mb-6 rounded-lg bg-red-50 p-4 text-red-600"
        >
            {{ error }}
        </div>

        <!-- Selectors -->
        <div
            class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
            <div>
                <label class="mb-2 block text-sm font-medium">
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
                <label class="mb-2 block text-sm font-medium">
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
            v-else-if="currentWord"
            class="mx-auto max-w-2xl"
        >
            <div
                class="rounded-2xl border bg-white p-8 text-center shadow-sm"
            >
                <p class="text-sm text-gray-400">
                    {{ lesson?.title }}
                </p>

                <p class="mt-2 text-sm text-gray-400">
                    Word {{ currentIndex + 1 }}
                    /
                    {{ words.length }}
                </p>

                <h2 class="mt-6 text-4xl font-bold">
                    {{ currentWord.word }}
                </h2>

                <p class="mt-3 text-lg text-gray-600">
                    {{ currentWord.meaning }}
                </p>

                <div
                    v-if="isPlaying"
                    class="mt-6 text-sm font-medium text-gray-500"
                >
                    <span v-if="playbackStep === 'word'">
                        🔊 Playing word...
                    </span>

                                    <span v-else-if="playbackStep === 'meaning'">
                        🇮🇷 Playing meaning...
                    </span>
                </div>

                <p class="mt-6 text-sm text-gray-400">
                    Repeat
                    {{ repeatCount }}
                    /
                    3
                </p>

                <div class="mt-8 flex justify-center gap-3">
                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="previous"
                    >
                        ← Previous
                    </button>

                    <button
                        v-if="!isPlaying"
                        type="button"
                        class="rounded-lg bg-black px-6 py-2 text-white hover:bg-gray-800"
                        @click="start"
                    >
                        ▶ Play
                    </button>

                    <button
                        v-else
                        type="button"
                        class="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700"
                        @click="stop"
                    >
                        ■ Stop
                    </button>

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="next"
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