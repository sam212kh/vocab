<script setup lang="ts">
import AppIcon from '../components/ui/AppIcon.vue'
import { computed, onMounted, ref } from 'vue'

import {
    loadLesson,
    loadManifest,
} from '../services/vocabulary'

import { resolveFullHardWords } from '../services/hardWordsLookup'
import { getMeanings } from '../services/vocabularyMeanings'

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

/* Every verified Persian meaning for the current word — never just the first, never fabricated. */
const currentMeanings = computed(() => {
    if (!currentWord.value) return []

    return getMeanings({ meaning: currentWord.value.meaning, synonyms: currentWord.value.synonyms })
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

/**
 * Previously: one lesson file fetched at a time, strictly sequentially,
 * across every lesson in every course (372 files) no matter how few hard
 * words were actually saved — fast enough on a local dev server to look
 * fine, but ~372 round-trips in series over a real network is the reported
 * production bug ("Hard words not loading" — it wasn't broken, it was
 * timing out / appearing to hang under real latency).
 *
 * Fixed by: delegating to the shared `resolveFullHardWords` lookup
 * (services/hardWordsLookup.ts) — the same authoritative source
 * HardWordsView.vue uses — instead of an inline duplicate scan. It fetches
 * lessons concurrently in bounded batches and stops as soon as every saved
 * hard word has actually been matched.
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

    if (!hardWordsStore.hardWords.length) {
        allHardWords.value = []
        hardWordsLoaded.value = true
        reset()
        return
    }

    loading.value = true
    error.value = ''

    try {
        const { found } = await resolveFullHardWords(
            hardWordsStore.hardWords.map(entry => entry.word),
            { version: 1, courses: courses.value }
        )

        allHardWords.value = found

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
            <h1>
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
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                    "
                    @click="changeMode('lesson')"
                >
                    <div
                        class="flex items-center gap-3"
                    >
                        <span class="text-2xl"><AppIcon name="book" :size="22" /></span>

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
                        <span class="text-2xl"><AppIcon name="star" :size="22" /></span>

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
                    class="field w-full"
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
                    class="field w-full disabled:bg-gray-100"
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
                        Hard Words
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
                        {{ hardWordsStore.hardWords.length }}
                    </div>

                    <div
                        class="text-xs text-yellow-600"
                    >
                        words
                    </div>
                </div>
            </div>

            <p
                v-if="hardWordsLoaded && allHardWords.length < hardWordsStore.hardWords.length"
                class="mt-3 border-t border-yellow-200 pt-3 text-sm text-yellow-700"
            >
                {{ allHardWords.length }} of {{ hardWordsStore.hardWords.length }} have audio and examples available to repeat here — the rest were saved from content that isn't in the vocabulary library (e.g. a reading or listening passage), so there's nothing to play for them on this screen. They're still saved — see
                <RouterLink to="/hard-words" class="font-semibold underline">Hard Words Practice</RouterLink>
                for the complete list.
            </p>
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
                    class="h-full rounded-full bg-accent transition-all duration-300"
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
                            ? 'Hard Words'
                            : 'Lesson Words'
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
                    v-if="currentMeanings.length <= 1"
                    class="mt-3 text-lg text-gray-600"
                >
                    {{ currentMeanings[0]?.text ?? currentWord.meaning }}
                </p>

                <ol
                    v-else
                    class="fa-text mt-3 list-inside list-decimal space-y-0.5 text-lg text-gray-600"
                    lang="fa"
                >
                    <li v-for="entry in currentMeanings" :key="entry.text">{{ entry.text }}</li>
                </ol>

                <details v-if="currentWord.examples?.length" class="mt-4 text-left group">
                    <summary class="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium text-accent-ink select-none">
                        <span class="transition group-open:rotate-90">›</span>
                        <span>Examples</span>
                    </summary>
                    <ul class="mt-2 space-y-3 border-t border-gray-100 pt-3">
                        <li v-for="(example, index) in currentWord.examples" :key="index">
                            <p class="wrap-anywhere text-sm text-gray-800" dir="ltr" lang="en">{{ example.english }}</p>
                            <p class="fa-text wrap-anywhere mt-0.5 text-sm text-gray-500" lang="fa">{{ example.persian }}</p>
                        </li>
                    </ul>
                </details>

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
                        Playing word...
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
                        class="btn-primary"
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
                mode === 'hard' &&
                !hardWordsStore.hardWords.length
            "
            class="surface px-6 py-12 text-center text-gray-500"
        >
            <div class="text-5xl">
                ⭐
            </div>

            <h2
                class="mt-4 text-lg font-semibold text-gray-700"
            >
                No hard words
            </h2>

            <p
                class="mx-auto mt-2 max-w-md text-sm text-gray-500"
            >
                You don't have any hard words yet.
                Click the button next to a word
                to add it to your Hard Words.
            </p>

            <button
                type="button"
                class="btn-primary mt-6"
                @click="
                    changeMode('lesson')
                "
            >
                Back to Lesson Words
            </button>
        </div>

        <!-- =========================================================
             HARD WORDS SAVED, BUT NONE PLAYABLE HERE
        ========================================================== -->

        <div
            v-else-if="
                !loading &&
                mode === 'hard' &&
                hardWordsStore.hardWords.length > 0
            "
            class="surface px-6 py-12 text-center text-gray-500"
        >
            <div class="text-5xl">
                ⭐
            </div>

            <h2 class="mt-4 text-lg font-semibold text-gray-700">
                {{ hardWordsStore.hardWords.length }} hard word{{ hardWordsStore.hardWords.length === 1 ? '' : 's' }} saved — none have audio here
            </h2>

            <p class="mx-auto mt-2 max-w-md text-sm text-gray-500">
                They were saved from content that isn't part of the vocabulary library (for example a reading or listening passage), so this screen has no example sentence or audio to repeat for them. Nothing was lost — see them all in Hard Words Practice.
            </p>

            <RouterLink to="/hard-words" class="btn-primary mt-6 inline-block">
                Open Hard Words Practice
            </RouterLink>
        </div>

        <!-- =========================================================
             NOTHING SELECTED
        ========================================================== -->

        <div
            v-else-if="
                !loading &&
                mode === 'lesson'
            "
            class="surface px-6 py-12 text-center text-gray-500"
        >
            Select a course and lesson to start.
        </div>
    </div>
</template>