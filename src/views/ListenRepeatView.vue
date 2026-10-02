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
import { useHardWordsStore } from '../stores/hardWords'

import HardWordButton from '../components/vocabulary/HardWordButton.vue'

type RepeatMode = 'lesson' | 'hard'

/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

const courses = ref<CourseManifest[]>([])

const selectedCourseId = ref('')
const selectedLessonId = ref('')

const lessonWords = ref<Word[]>([])
const allHardWords = ref<Word[]>([])

const lesson = ref<LessonManifest | null>(null)

const loading = ref(false)
const error = ref('')

const mode = ref<RepeatMode>('lesson')

const hardWordsLoaded = ref(false)

/*
|--------------------------------------------------------------------------
| Hard Words Store
|--------------------------------------------------------------------------
*/

const hardWordsStore = useHardWordsStore()

/*
|--------------------------------------------------------------------------
| Selected Course
|--------------------------------------------------------------------------
*/

const selectedCourse = computed(() => {
    return courses.value.find(
        course => course.id === selectedCourseId.value
    )
})

/*
|--------------------------------------------------------------------------
| Available Lessons
|--------------------------------------------------------------------------
*/

const availableLessons = computed(() => {
    return selectedCourse.value?.lessons ?? []
})

/*
|--------------------------------------------------------------------------
| Words to Play
|--------------------------------------------------------------------------
|
| Lesson mode:
|     selected lesson words
|
| Hard mode:
|     ALL hard words from ALL courses/lessons
|
*/

const playableWords = computed<Word[]>(() => {
    if (mode.value === 'hard') {
        return allHardWords.value
    }

    return lessonWords.value
})

/*
|--------------------------------------------------------------------------
| Listen & Repeat
|--------------------------------------------------------------------------
*/
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
} = useListenRepeat(playableWords)




/*
|--------------------------------------------------------------------------
| Current Word
|--------------------------------------------------------------------------
*/

const currentWord = computed(() => {
    return playableWords.value[currentIndex.value] ?? null
})

/*
|--------------------------------------------------------------------------
| Load All Hard Words
|--------------------------------------------------------------------------
|
| Hard Words are global.
|
| We go through every course and every lesson,
| load the lesson JSON and keep only words that
| are currently marked as hard.
|
*/

async function loadAllHardWords() {
    /*
     * Already loaded?
     * Don't download all JSON files again.
     */
    if (hardWordsLoaded.value) {
        reset()
        return
    }

    loading.value = true
    error.value = ''

    try {
        const collectedWords: Word[] = []

        for (const course of courses.value) {
            for (const lessonItem of course.lessons) {
                try {
                    const words = await loadLesson(
                        lessonItem
                    )

                    const hardWords = words.filter(word =>
                        hardWordsStore.isHardWord(
                            word.word
                        )
                    )

                    collectedWords.push(
                        ...hardWords
                    )
                } catch (err) {
                    console.error(
                        `Failed to load ${lessonItem.id}:`,
                        err
                    )
                }
            }
        }

        /*
         * Remove duplicates by actual word.
         */
        const uniqueWords = new Map<
            string,
            Word
        >()

        for (const word of collectedWords) {
            const key = word.word
                .trim()
                .toLowerCase()

            if (!uniqueWords.has(key)) {
                uniqueWords.set(
                    key,
                    word
                )
            }
        }

        allHardWords.value = Array.from(
            uniqueWords.values()
        )

        hardWordsLoaded.value = true

        reset()
    } catch (err) {
        console.error(
            'Failed to load hard words:',
            err
        )

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load hard words'
    } finally {
        loading.value = false
    }
}

/*
|--------------------------------------------------------------------------
| Change Repeat Mode
|--------------------------------------------------------------------------
*/

async function changeMode(
    newMode: RepeatMode
) {
    if (mode.value === newMode) {
        return
    }

    stop()

    mode.value = newMode

    error.value = ''

    if (newMode === 'hard') {
        await loadAllHardWords()
        return
    }

    reset()
}

/*
|--------------------------------------------------------------------------
| Load Selected Lesson
|--------------------------------------------------------------------------
*/

async function loadSelectedLesson() {
    if (
        !selectedCourse.value ||
        !selectedLessonId.value
    ) {
        return
    }

    const selectedLesson =
        selectedCourse.value.lessons.find(
            item =>
                item.id ===
                selectedLessonId.value
        )

    if (!selectedLesson) {
        return
    }

    stop()

    loading.value = true
    error.value = ''

    try {
        lesson.value = selectedLesson

        lessonWords.value =
            await loadLesson(
                selectedLesson
            )

        reset()
    } catch (err) {
        console.error(
            'Failed to load lesson:',
            err
        )

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

/*
|--------------------------------------------------------------------------
| Change Course
|--------------------------------------------------------------------------
*/

function changeCourse() {
    stop()

    selectedLessonId.value = ''

    lesson.value = null

    lessonWords.value = []

    reset()
}

/*
|--------------------------------------------------------------------------
| Load Manifest
|--------------------------------------------------------------------------
*/

onMounted(async () => {
    try {
        const manifest =
            await loadManifest()

        courses.value =
            manifest.courses
    } catch (err) {
        console.error(err)

        error.value =
            'Failed to load courses'
    }
})


</script>

<template>
    <div>
        <!-- =========================================================
             Header
        ========================================================== -->

        <div class="mb-8">
            <h1 class="text-3xl font-bold">
                Listen & Repeat
            </h1>

            <p class="mt-2 text-gray-500">
                Listen to each word three times and repeat it.
            </p>
        </div>

        <!-- =========================================================
             Error
        ========================================================== -->

        <div
            v-if="error"
            class="mb-6 rounded-lg bg-red-50 p-4 text-red-600"
        >
            {{ error }}
        </div>

        <!-- =========================================================
             Repeat Mode
        ========================================================== -->

        <div class="mb-8">
            <label
                class="mb-2 block text-sm font-medium"
            >
                Repeat Mode
            </label>

            <div
                class="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
                <!-- Lesson Words -->

                <button
                    type="button"
                    class="rounded-xl border p-4 text-left transition"
                    :class="
                        mode === 'lesson'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                    "
                    @click="changeMode('lesson')"
                >
                    <div
                        class="flex items-center gap-3"
                    >
                        <span class="text-2xl">
                            📖
                        </span>

                        <div>
                            <div
                                class="font-semibold"
                            >
                                Lesson Words
                            </div>

                            <div
                                class="mt-1 text-sm"
                                :class="
                                    mode === 'lesson'
                                        ? 'text-gray-300'
                                        : 'text-gray-500'
                                "
                            >
                                Repeat words from a selected lesson
                            </div>
                        </div>
                    </div>
                </button>

                <!-- Hard Words -->

                <button
                    type="button"
                    class="rounded-xl border p-4 text-left transition"
                    :class="
                        mode === 'hard'
                            ? 'border-yellow-400 bg-yellow-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                    "
                    @click="changeMode('hard')"
                >
                    <div
                        class="flex items-center gap-3"
                    >
                        <span class="text-2xl">
                            ⭐
                        </span>

                        <div>
                            <div
                                class="font-semibold"
                                :class="
                                    mode === 'hard'
                                        ? 'text-yellow-700'
                                        : 'text-gray-900'
                                "
                            >
                                Hard Words
                            </div>

                            <div
                                class="mt-1 text-sm text-gray-500"
                            >
                                Repeat all your hard words
                            </div>
                        </div>
                    </div>
                </button>
            </div>
        </div>

        <!-- =========================================================
             LESSON MODE
             Course + Lesson selectors
        ========================================================== -->

        <div
            v-if="mode === 'lesson'"
            class="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
            <!-- Course -->

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

            <!-- Lesson -->

            <div>
                <label
                    class="mb-2 block text-sm font-medium"
                >
                    Lesson
                </label>

                <select
                    v-model="selectedLessonId"
                    class="w-full rounded-lg border bg-white px-4 py-3 disabled:bg-gray-100"
                    :disabled="
                        !selectedCourseId
                    "
                    @change="
                        loadSelectedLesson
                    "
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

        <!-- =========================================================
             HARD WORDS MODE
        ========================================================== -->

        <div
            v-else
            class="mb-8 rounded-xl border border-yellow-200 bg-yellow-50 p-4"
        >
            <div
                class="flex items-center justify-between gap-4"
            >
                <div>
                    <p
                        class="font-semibold text-yellow-800"
                    >
                        ⭐ Hard Words
                    </p>

                    <p
                        class="mt-1 text-sm text-yellow-700"
                    >
                        Repeating all your hard words
                        from all courses and lessons.
                    </p>
                </div>

                <div
                    class="shrink-0 text-center"
                >
                    <div
                        class="text-2xl font-bold text-yellow-700"
                    >
                        {{ allHardWords.length }}
                    </div>

                    <div
                        class="text-xs text-yellow-600"
                    >
                        words
                    </div>
                </div>
            </div>
        </div>

        <!-- =========================================================
             Loading
        ========================================================== -->

        <div
            v-if="loading"
            class="py-12 text-center text-gray-500"
        >
            <div class="text-lg">
                Loading...
            </div>

            <p
                v-if="mode === 'hard'"
                class="mt-2 text-sm"
            >
                Loading all your hard words...
            </p>
        </div>

        <!-- =========================================================
             Progress
        ========================================================== -->

        <div
            v-else-if="playableWords.length"
            class="mb-6"
        >
            <div
                class="mb-2 flex items-center justify-between text-sm text-gray-500"
            >
                <span>
                    Word
                    {{ currentNumber }}
                    of
                    {{ total }}
                </span>

                <span>
                    {{
                        Math.round(
                            progressPercent
                        )
                    }}%
                </span>
            </div>

            <div
                class="h-2 overflow-hidden rounded-full bg-gray-200"
            >
                <div
                    class="h-full rounded-full bg-black transition-all duration-300"
                    :style="{
                        width: `${progressPercent}%`
                    }"
                />
            </div>
        </div>

        <!-- =========================================================
             CURRENT WORD
        ========================================================== -->

        <div
            v-if="
                !loading &&
                currentWord
            "
            class="mx-auto max-w-2xl"
        >
            <div
                class="rounded-2xl border bg-white p-8 text-center shadow-sm"
            >
                <!-- Source lesson -->

                <p
                    v-if="
                        mode === 'hard' &&
                        currentWord.lessonId
                    "
                    class="text-sm text-gray-400"
                >
                    {{ currentWord.lessonId }}
                </p>

                <p
                    v-else-if="lesson"
                    class="text-sm text-gray-400"
                >
                    {{ lesson.title }}
                </p>

                <!-- Mode -->

                <p
                    class="mt-2 text-xs font-medium uppercase tracking-wide"
                    :class="
                        mode === 'hard'
                            ? 'text-yellow-600'
                            : 'text-gray-400'
                    "
                >
                    {{
                        mode === 'hard'
                            ? '⭐ Hard Words'
                            : '📖 Lesson Words'
                    }}
                </p>

                <!-- Number -->

                <p
                    class="mt-3 text-sm text-gray-400"
                >
                    Word
                    {{ currentIndex + 1 }}
                    /
                    {{ playableWords.length }}
                </p>

                <!-- Word -->

                <h2
                    class="mt-6 text-4xl font-bold"
                >
                    {{ currentWord.word }}
                </h2>

                <!-- Meaning -->

                <p
                    class="mt-3 text-lg text-gray-600"
                >
                    {{ currentWord.meaning }}
                </p>

                <!-- Playback status -->

                <div
                    v-if="isPlaying"
                    class="mt-6 text-sm font-medium text-gray-500"
                >
                    <span
                        v-if="
                            playbackStep ===
                            'word'
                        "
                    >
                        🔊 Playing word...
                    </span>

                    <span
                        v-else-if="
                            playbackStep ===
                            'meaning'
                        "
                    >
                        🇮🇷 Playing meaning...
                    </span>
                </div>

                <!-- Repeat count -->

                <p
                    class="mt-6 text-sm text-gray-400"
                >
                    Repeat
                    {{ repeatCount }}
                    /
                    3
                </p>

                <!-- Controls -->

                <div
                    class="mt-8 flex flex-wrap justify-center gap-3"
                >
                    <!-- Previous -->

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="previous"
                    >
                        ← Previous
                    </button>

                    <!-- Play -->

                    <button
                        v-if="!isPlaying"
                        type="button"
                        class="rounded-lg bg-black px-6 py-2 text-white hover:bg-gray-800"
                        @click="start"
                    >
                        ▶ Play
                    </button>
                    <!-- Stop -->

                    <button
                        v-else
                        type="button"
                        class="rounded-lg bg-red-600 px-6 py-2 text-white hover:bg-red-700"
                        @click="stop"
                    >
                        ■ Stop
                    </button>

                    <!-- Next -->

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="next"
                    >
                        Next →
                    </button>

                    <!-- Repeat -->

                    <button
                        type="button"
                        class="rounded-lg border px-4 py-2 hover:bg-gray-50"
                        @click="repeatCurrent"
                    >
                        ↻ Repeat
                    </button>

                    <!-- Hard Word -->

                    <HardWordButton
                        :word-id="
                            currentWord.word
                        "
                        :meaning="
                            currentWord.meaning
                        "
                    />
                </div>
            </div>
        </div>

        <!-- =========================================================
             NO HARD WORDS
        ========================================================== -->

        <div
            v-else-if="
                !loading &&
                mode === 'hard'
            "
            class="rounded-xl border border-dashed p-12 text-center"
        >
            <div class="text-5xl">
                ⭐
            </div>

            <h2
                class="mt-4 text-lg font-semibold text-gray-700"
            >
                No Hard Words
            </h2>

            <p
                class="mx-auto mt-2 max-w-md text-sm text-gray-500"
            >
                You don't have any hard words yet.
                Click the ⭐ button next to a word
                to add it to your Hard Words.
            </p>

            <button
                type="button"
                class="mt-6 rounded-lg bg-black px-5 py-2 text-sm text-white hover:bg-gray-800"
                @click="
                    changeMode('lesson')
                "
            >
                Back to Lesson Words
            </button>
        </div>

        <!-- =========================================================
             NOTHING SELECTED
        ========================================================== -->

        <div
            v-else-if="
                !loading &&
                mode === 'lesson'
            "
            class="rounded-xl border border-dashed p-12 text-center text-gray-500"
        >
            Select a course and lesson to start.
        </div>
    </div>
</template>