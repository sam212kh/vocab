<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useWordProgressStore } from '../stores/wordProgress'

import {
    checkPronunciation,
} from '../services/pronunciation'

import {
    useSpeakingPractice,
} from '../composables/useSpeakingPractice'

import {
    loadManifest,
    loadLesson,
} from '../services/vocabulary'

import type {
    CourseManifest,
    LessonManifest,
    Word,
} from '../types/vocabulary'

import SpeechButton from '../components/ui/SpeechButton.vue'

const wordProgressStore =
    useWordProgressStore()

const {
    isSupported,
    isListening,
    transcript,
    error: speechError,
    startListening,
    reset,
} = useSpeakingPractice()

const courses =
    ref<CourseManifest[]>([])

const words =
    ref<Word[]>([])

const currentIndex =
    ref(0)

const loading =
    ref(false)

const error =
    ref('')

const phase = ref<
    'ready' |
    'speak' |
    'result'
>('ready')

const pronunciationScore =
    ref<number | null>(null)

const pronunciationCorrect =
    ref(false)

const answerRecorded =
    ref(false)

const isCompleted =
    ref(false)

const currentWord = computed(() => {
    return (
        words.value[
            currentIndex.value
            ] ?? null
    )
})

const currentProgress = computed(() => {
    if (!currentWord.value) {
        return null
    }

    return wordProgressStore.getProgress(
        currentWord.value.word
    )
})

const progressPercent = computed(() => {
    if (!words.value.length) {
        return 0
    }

    return Math.round(
        ((currentIndex.value + 1) /
            words.value.length) *
        100
    )
})

async function loadReviewWords() {
    loading.value = true
    error.value = ''
    isCompleted.value = false

    resetPracticeState()

    try {
        const manifest =
            await loadManifest()

        courses.value =
            manifest.courses

        const dueProgress =
            wordProgressStore.getDueWords()

        if (!dueProgress.length) {
            words.value = []
            return
        }

        const requiredLessons =
            new Map<
                string,
                {
                    courseId: string
                    lesson: LessonManifest
                }
            >()

        /*
         * Find only lessons that contain
         * words currently due for review.
         */
        for (
            const item of dueProgress
            ) {
            if (
                !item.courseId ||
                !item.lessonId
            ) {
                continue
            }

            const course =
                courses.value.find(
                    course =>
                        course.id ===
                        item.courseId
                )

            if (!course) {
                continue
            }

            const lesson =
                course.lessons.find(
                    lesson =>
                        lesson.id ===
                        item.lessonId
                )

            if (!lesson) {
                continue
            }

            const key =
                `${item.courseId}:${item.lessonId}`

            if (
                !requiredLessons.has(key)
            ) {
                requiredLessons.set(
                    key,
                    {
                        courseId:
                        item.courseId,
                        lesson,
                    }
                )
            }
        }

        const dueWords =
            new Set(
                dueProgress.map(
                    item =>
                        item.wordId
                            .trim()
                            .toLowerCase()
                )
            )

        const loadedWords: Word[] = []

        /*
         * Load only the required lesson files.
         */
        for (
            const {
                lesson,
            } of requiredLessons.values()
            ) {
            const lessonWords =
                await loadLesson(lesson)

            for (
                const word of lessonWords
                ) {
                const normalized =
                    word.word
                        .trim()
                        .toLowerCase()

                if (
                    dueWords.has(
                        normalized
                    )
                ) {
                    loadedWords.push(word)
                }
            }
        }

        words.value =
            loadedWords

        currentIndex.value = 0

        if (!words.value.length) {
            isCompleted.value = true
        }
    } catch (err) {
        console.error(err)

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to load review words'
    } finally {
        loading.value = false
    }
}

function resetPracticeState() {
    reset()

    phase.value = 'ready'

    pronunciationScore.value =
        null

    pronunciationCorrect.value =
        false

    answerRecorded.value =
        false
}

function startSpeaking() {
    if (!currentWord.value) {
        return
    }

    resetPracticeState()

    phase.value = 'speak'
}

async function practiceCurrentWord() {
    if (
        !currentWord.value ||
        isListening.value
    ) {
        return
    }

    pronunciationScore.value =
        null

    pronunciationCorrect.value =
        false

    reset()

    phase.value = 'speak'

    await startListening()

    if (!transcript.value) {
        return
    }

    const result =
        checkPronunciation(
            currentWord.value.word,
            transcript.value
        )

    pronunciationScore.value =
        result.score

    pronunciationCorrect.value =
        result.correct

    /*
     * Get the existing Progress so we
     * preserve courseId and lessonId.
     */
    const progress =
        wordProgressStore.getProgress(
            currentWord.value.word
        )

    if (result.correct) {
        wordProgressStore.recordCorrect(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId
        )
    } else {
        wordProgressStore.recordWrong(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId
        )
    }

    answerRecorded.value = true

    phase.value = 'result'
}

function tryAgain() {
    resetPracticeState()

    phase.value = 'speak'
}

function markKnown() {
    if (!currentWord.value) {
        return
    }

    /*
     * If the speaking result has already
     * been recorded, do not record again.
     */
    if (!answerRecorded.value) {
        const progress =
            wordProgressStore.getProgress(
                currentWord.value.word
            )

        wordProgressStore.recordCorrect(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId
        )
    }

    removeCurrentFromSession()
}

function markDifficult() {
    if (!currentWord.value) {
        return
    }

    /*
     * If the speaking result has already
     * been recorded, do not record again.
     */
    if (!answerRecorded.value) {
        const progress =
            wordProgressStore.getProgress(
                currentWord.value.word
            )

        wordProgressStore.recordWrong(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId
        )
    }

    /*
     * The word remains in the user's
     * learning system, but is removed
     * from this current review session.
     */
    removeCurrentFromSession()
}

function removeCurrentFromSession() {
    resetPracticeState()

    if (!words.value.length) {
        return
    }

    words.value.splice(
        currentIndex.value,
        1
    )

    if (!words.value.length) {
        currentIndex.value = 0
        isCompleted.value = true
        return
    }

    if (
        currentIndex.value >=
        words.value.length
    ) {
        currentIndex.value =
            words.value.length - 1
    }
}

function skipWord() {
    resetPracticeState()

    if (!words.value.length) {
        return
    }

    if (
        currentIndex.value <
        words.value.length - 1
    ) {
        currentIndex.value++
    } else {
        currentIndex.value = 0
    }
}

function previousWord() {
    resetPracticeState()

    if (!words.value.length) {
        return
    }

    if (currentIndex.value > 0) {
        currentIndex.value--
    } else {
        currentIndex.value =
            words.value.length - 1
    }
}

function refresh() {
    loadReviewWords()
}

onMounted(() => {
    loadReviewWords()
})
</script>

<template>
    <div>
        <!-- Header -->
        <div class="mb-8">
            <div
                class="flex items-center justify-between"
            >
                <div>
                    <h1
                        class="text-3xl font-bold"
                    >
                        Review Words
                    </h1>

                    <p
                        class="mt-2 text-gray-500"
                    >
                        Review words that are
                        due for practice.
                    </p>
                </div>

                <button
                    type="button"
                    class="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    :disabled="loading"
                    @click="refresh"
                >
                    ↻ Refresh
                </button>
            </div>
        </div>

        <!-- Error -->
        <div
            v-if="error"
            class="mb-6 rounded-lg bg-red-50 p-4 text-red-600"
        >
            {{ error }}
        </div>

        <!-- Loading -->
        <div
            v-if="loading"
            class="py-12 text-center text-gray-500"
        >
            Loading review words...
        </div>

        <!-- Empty -->
        <div
            v-else-if="
                !currentWord &&
                !isCompleted
            "
            class="rounded-xl border border-dashed p-12 text-center"
        >
            <div class="text-4xl">
                🎉
            </div>

            <p
                class="mt-4 text-lg font-medium"
            >
                No words are due for review.
            </p>

            <p
                class="mt-2 text-sm text-gray-500"
            >
                Come back later.
            </p>
        </div>

        <!-- Completed -->
        <div
            v-else-if="isCompleted"
            class="mx-auto max-w-2xl rounded-2xl border bg-white p-12 text-center shadow-sm"
        >
            <div class="text-5xl">
                🎉
            </div>

            <h2
                class="mt-6 text-2xl font-bold"
            >
                Review Complete
            </h2>

            <p
                class="mt-3 text-gray-500"
            >
                You have completed all words
                that were due for review.
            </p>

            <button
                type="button"
                class="mt-8 rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
                @click="refresh"
            >
                Check Again
            </button>
        </div>

        <!-- Review -->
        <div
            v-else
            class="mx-auto max-w-2xl"
        >
            <!-- Progress -->
            <div class="mb-6">
                <div
                    class="mb-2 flex justify-between text-sm text-gray-500"
                >
                    <span>
                        Word
                        {{ currentIndex + 1 }}
                        of
                        {{ words.length }}
                    </span>

                    <span>
                        {{ progressPercent }}%
                    </span>
                </div>

                <div
                    class="h-2 overflow-hidden rounded-full bg-gray-200"
                >
                    <div
                        class="h-full rounded-full bg-black transition-all duration-300"
                        :style="{
                            width:
                                `${progressPercent}%`,
                        }"
                    />
                </div>
            </div>

            <!-- Card -->
            <div
                class="rounded-2xl border bg-white p-8 text-center shadow-sm"
            >
                <!-- READY -->
                <div
                    v-if="phase === 'ready'"
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Review
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Remember the word
                    </h2>

                    <div
                        class="mt-10"
                    >
                        <div
                            class="flex items-center justify-center gap-3"
                        >
                            <h3
                                class="text-4xl font-bold"
                            >
                                {{ currentWord.word }}
                            </h3>

                            <SpeechButton
                                :text="
                                    currentWord.word
                                "
                                lang="en-US"
                                label="🔊"
                            />
                        </div>

                        <p
                            class="mt-5 text-lg text-gray-600"
                        >
                            {{ currentWord.meaning }}
                        </p>

                        <SpeechButton
                            :text="
                                currentWord.meaning
                            "
                            lang="fa-IR"
                            label="🔊 Persian"
                        />
                    </div>

                    <button
                        type="button"
                        class="mt-10 rounded-lg bg-black px-8 py-3 text-white hover:bg-gray-800"
                        @click="
                            startSpeaking
                        "
                    >
                        🎙 Practice
                    </button>
                </div>

                <!-- SPEAK -->
                <div
                    v-else-if="
                        phase === 'speak'
                    "
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Speaking Practice
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Say the word
                    </h2>

                    <p
                        class="mt-10 text-4xl font-bold"
                    >
                        {{ currentWord.word }}
                    </p>

                    <p
                        class="mt-4 text-gray-500"
                    >
                        Say it clearly.
                    </p>

                    <button
                        v-if="!isListening"
                        type="button"
                        class="mt-10 rounded-full bg-black px-8 py-4 text-lg text-white hover:bg-gray-800 disabled:opacity-50"
                        :disabled="!isSupported"
                        @click="
                            practiceCurrentWord
                        "
                    >
                        🎙 Start Speaking
                    </button>

                    <div
                        v-else
                        class="mt-10 rounded-lg bg-gray-100 px-8 py-4 text-gray-600"
                    >
                        🎙 Listening...
                    </div>

                    <p
                        v-if="!isSupported"
                        class="mt-4 text-sm text-red-500"
                    >
                        Speech recognition is
                        not supported in this
                        browser.
                    </p>

                    <p
                        v-if="speechError"
                        class="mt-4 text-sm text-red-500"
                    >
                        {{ speechError }}
                    </p>

                    <div
                        class="mt-8"
                    >
                        <button
                            type="button"
                            class="text-sm text-gray-500 hover:text-black"
                            @click="skipWord"
                        >
                            Skip →
                        </button>
                    </div>
                </div>

                <!-- RESULT -->
                <div
                    v-else-if="
                        phase === 'result'
                    "
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Result
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        {{ currentWord.word }}
                    </h2>

                    <div
                        v-if="
                            pronunciationScore !==
                            null
                        "
                        class="mt-8"
                    >
                        <div
                            class="text-5xl font-bold"
                        >
                            {{
                                pronunciationScore
                            }}%
                        </div>

                        <p
                            v-if="
                                pronunciationCorrect
                            "
                            class="mt-3 text-lg font-semibold text-green-600"
                        >
                            ✅ Correct!
                        </p>

                        <p
                            v-else
                            class="mt-3 text-lg font-semibold text-red-600"
                        >
                            ❌ Try again
                        </p>
                    </div>

                    <div
                        v-if="transcript"
                        class="mt-6 rounded-xl bg-gray-50 p-4"
                    >
                        <p
                            class="text-sm text-gray-500"
                        >
                            You said:
                        </p>

                        <p
                            class="mt-1 font-medium"
                        >
                            {{ transcript }}
                        </p>
                    </div>

                    <div
                        class="mt-8 flex flex-wrap justify-center gap-3"
                    >
                        <button
                            v-if="
                                !pronunciationCorrect
                            "
                            type="button"
                            class="rounded-lg border px-5 py-2 hover:bg-gray-50"
                            @click="
                                tryAgain
                            "
                        >
                            🔁 Try Again
                        </button>

                        <button
                            type="button"
                            class="rounded-lg bg-black px-5 py-2 text-white hover:bg-gray-800"
                            @click="
                                markKnown
                            "
                        >
                            ✓ I Know It
                        </button>

                        <button
                            type="button"
                            class="rounded-lg border border-red-300 px-5 py-2 text-red-600 hover:bg-red-50"
                            @click="
                                markDifficult
                            "
                        >
                            😕 Still Difficult
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div
                    v-if="currentProgress"
                    class="mt-8 border-t pt-5 text-sm text-gray-500"
                >
                    <div
                        class="flex flex-wrap justify-center gap-x-5 gap-y-2"
                    >
                        <span>
                            Level:
                            <strong
                                class="text-gray-700"
                            >
                                {{
                                    currentProgress.level
                                }}
                            </strong>
                        </span>

                        <span>
                            Correct:
                            <strong
                                class="text-gray-700"
                            >
                                {{
                                    currentProgress.correctAnswers
                                }}
                            </strong>
                        </span>

                        <span>
                            Wrong:
                            <strong
                                class="text-gray-700"
                            >
                                {{
                                    currentProgress.wrongAnswers
                                }}
                            </strong>
                        </span>

                        <span>
                            Streak:
                            <strong
                                class="text-gray-700"
                            >
                                {{
                                    currentProgress.streak
                                }}
                            </strong>
                        </span>
                    </div>
                </div>

                <!-- Navigation -->
                <div
                    class="mt-8 flex justify-between border-t pt-6"
                >
                    <button
                        type="button"
                        class="text-sm text-gray-500 hover:text-black"
                        @click="
                            previousWord
                        "
                    >
                        ← Previous
                    </button>

                    <button
                        type="button"
                        class="text-sm text-gray-500 hover:text-black"
                        @click="skipWord"
                    >
                        Skip →
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>