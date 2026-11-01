<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useWordProgressStore } from '../stores/wordProgress'

import {
    checkPronunciation,
} from '../services/pronunciation'

import {
    answersMatch,
} from '../services/textMatch'

import {
    useSpeakingPractice,
} from '../composables/useSpeakingPractice'

import {
    loadManifest,
    loadLesson,
} from '../services/vocabulary'

import type {
    Word,
} from '../types/vocabulary'

import SpeechButton from '../components/ui/SpeechButton.vue'

/*
 * One daily session mixes words that are due for
 * spaced-repetition review with a handful of brand
 * new words, shuffled together. Studying old and new
 * material interleaved (rather than one lesson block
 * at a time) is the "interleaving effect" — it forces
 * active discrimination between items instead of
 * passive repetition of a single topic.
 */
const NEW_WORD_QUOTA = 5

const MAX_LESSONS_SCANNED_FOR_NEW_WORDS = 20

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

const words =
    ref<Word[]>([])

const currentIndex =
    ref(0)

const loading =
    ref(false)

const error =
    ref('')

const isCompleted =
    ref(false)

const dueCount =
    ref(0)

const newCount =
    ref(0)

const phase = ref<
    'recall' |
    'speak' |
    'result'
>('recall')

const pronunciationScore =
    ref<number | null>(null)

const pronunciationCorrect =
    ref(false)

const answerRecorded =
    ref(false)

const recallAnswer =
    ref('')

const recallRevealed =
    ref(false)

const recallCorrect =
    ref(false)

const currentWord = computed(() => {
    return (
        words.value[
            currentIndex.value
            ] ?? null
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

function shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5)
}

async function buildSession() {
    loading.value = true
    error.value = ''
    isCompleted.value = false

    resetPracticeState()

    try {
        const manifest = await loadManifest()

        const dueProgress =
            wordProgressStore.getDueWords()

        const requiredLessons =
            new Map<
                string,
                { courseId: string; lessonId: string }
            >()

        for (const item of dueProgress) {
            if (!item.courseId || !item.lessonId) {
                continue
            }

            requiredLessons.set(
                `${item.courseId}:${item.lessonId}`,
                { courseId: item.courseId, lessonId: item.lessonId }
            )
        }

        const dueWordIds = new Set(
            dueProgress.map(item => item.wordId)
        )

        const dueWords: Word[] = []

        for (const { courseId, lessonId } of requiredLessons.values()) {
            const course = manifest.courses.find(c => c.id === courseId)
            const lesson = course?.lessons.find(l => l.id === lessonId)

            if (!lesson) {
                continue
            }

            const lessonWords = await loadLesson(lesson)

            for (const word of lessonWords) {
                if (dueWordIds.has(word.word.trim().toLowerCase())) {
                    dueWords.push(word)
                }
            }
        }

        /*
         * Fill the rest of the quota with words that
         * have never been studied before.
         */
        const studiedWordIds = new Set(
            wordProgressStore.progress.map(item => item.wordId)
        )

        const newWords: Word[] = []

        let lessonsScanned = 0

        for (const course of manifest.courses) {
            for (const lesson of course.lessons) {
                if (newWords.length >= NEW_WORD_QUOTA) {
                    break
                }

                if (lessonsScanned >= MAX_LESSONS_SCANNED_FOR_NEW_WORDS) {
                    break
                }

                lessonsScanned++

                const lessonWords = await loadLesson(lesson)

                for (const word of lessonWords) {
                    if (newWords.length >= NEW_WORD_QUOTA) {
                        break
                    }

                    const normalized = word.word.trim().toLowerCase()

                    if (!studiedWordIds.has(normalized)) {
                        newWords.push(word)
                        studiedWordIds.add(normalized)
                    }
                }
            }

            if (newWords.length >= NEW_WORD_QUOTA) {
                break
            }
        }

        dueCount.value = dueWords.length
        newCount.value = newWords.length

        words.value = shuffle([...dueWords, ...newWords])
        currentIndex.value = 0

        if (!words.value.length) {
            isCompleted.value = true
        }
    } catch (err) {
        console.error(err)

        error.value =
            err instanceof Error
                ? err.message
                : 'Failed to build session'
    } finally {
        loading.value = false
    }
}

function resetPracticeState() {
    reset()

    phase.value = 'recall'

    pronunciationScore.value = null
    pronunciationCorrect.value = false
    answerRecorded.value = false

    recallAnswer.value = ''
    recallRevealed.value = false
    recallCorrect.value = false
}

function submitRecall() {
    if (!currentWord.value || recallRevealed.value) {
        return
    }

    recallRevealed.value = true

    recallCorrect.value = answersMatch(
        currentWord.value.word,
        recallAnswer.value
    )

    const progress = wordProgressStore.getProgress(
        currentWord.value.word,
        currentWord.value.courseId,
        currentWord.value.lessonId
    )

    if (recallCorrect.value) {
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
}

function proceedToSpeak() {
    if (!currentWord.value) {
        return
    }

    phase.value = 'speak'
}

async function practiceCurrentWord() {
    if (!currentWord.value || isListening.value) {
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

    pronunciationScore.value = result.score
    pronunciationCorrect.value = result.correct

    phase.value = 'result'
}

function skipSpeaking() {
    phase.value = 'result'
}

function nextWord() {
    resetPracticeState()

    if (!words.value.length) {
        return
    }

    if (currentIndex.value < words.value.length - 1) {
        currentIndex.value++
        return
    }

    isCompleted.value = true
}

function restart() {
    buildSession()
}

onMounted(() => {
    buildSession()
})
</script>

<template>
    <div>
        <div class="mb-8">
            <h1 class="text-3xl font-bold">Daily Session</h1>
            <p class="mt-2 text-gray-500">
                Due reviews mixed with a few new words — interleaved, not blocked.
            </p>
        </div>

        <div v-if="error" class="mb-6 rounded-lg bg-red-50 p-4 text-red-600">
            {{ error }}
        </div>

        <div v-if="loading" class="py-12 text-center text-gray-500">
            Building your session...
        </div>

        <div
            v-else-if="isCompleted"
            class="mx-auto max-w-2xl rounded-2xl border bg-white p-12 text-center shadow-sm"
        >
            <div class="text-5xl">🎉</div>
            <h2 class="mt-6 text-2xl font-bold">Session Complete</h2>
            <p class="mt-3 text-gray-500">
                {{ dueCount }} due + {{ newCount }} new words covered.
            </p>
            <button
                type="button"
                class="mt-8 rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
                @click="restart"
            >
                Start another session
            </button>
        </div>

        <div v-else-if="currentWord" class="mx-auto max-w-2xl">
            <div class="mb-6">
                <div class="mb-2 flex justify-between text-sm text-gray-500">
                    <span>Word {{ currentIndex + 1 }} of {{ words.length }}</span>
                    <span>{{ progressPercent }}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                        class="h-full rounded-full bg-black transition-all duration-300"
                        :style="{ width: `${progressPercent}%` }"
                    />
                </div>
            </div>

            <div class="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <!-- RECALL -->
                <div v-if="phase === 'recall'">
                    <p class="text-sm font-medium uppercase tracking-wide text-gray-400">
                        Recall
                    </p>
                    <h2 class="mt-2 text-2xl font-bold">What's the word?</h2>

                    <div class="mt-10">
                        <p class="text-lg text-gray-600">{{ currentWord.meaning }}</p>
                        <SpeechButton :text="currentWord.meaning" lang="fa-IR" />
                    </div>

                    <form v-if="!recallRevealed" class="mt-8" @submit.prevent="submitRecall">
                        <input
                            v-model="recallAnswer"
                            autofocus
                            autocomplete="off"
                            placeholder="Type the English word..."
                            class="w-full rounded-xl border px-4 py-4 text-center text-xl outline-none focus:border-gray-900"
                        />
                        <button
                            type="submit"
                            class="mt-5 w-full rounded-xl bg-black px-8 py-3 text-white hover:bg-gray-800"
                        >
                            Check
                        </button>
                    </form>

                    <div v-else class="mt-8">
                        <div class="flex items-center justify-center gap-3">
                            <h3 class="text-4xl font-bold">{{ currentWord.word }}</h3>
                            <SpeechButton :text="currentWord.word" lang="en-US" />
                        </div>

                        <p
                            class="mt-4 text-lg font-semibold"
                            :class="recallCorrect ? 'text-green-600' : 'text-red-600'"
                        >
                            {{
                                recallCorrect
                                    ? '✅ Correct!'
                                    : `❌ You said: ${recallAnswer || '(nothing)'}`
                            }}
                        </p>

                        <button
                            type="button"
                            class="mt-8 rounded-lg bg-black px-8 py-3 text-white hover:bg-gray-800"
                            @click="proceedToSpeak"
                        >
                            🎙 Continue to speaking →
                        </button>
                    </div>
                </div>

                <!-- SPEAK -->
                <div v-else-if="phase === 'speak'">
                    <p class="text-sm font-medium uppercase tracking-wide text-gray-400">
                        Speak
                    </p>
                    <h2 class="mt-2 text-2xl font-bold">Say the word</h2>

                    <p class="mt-10 text-4xl font-bold">{{ currentWord.word }}</p>

                    <button
                        v-if="!isListening"
                        type="button"
                        class="mt-10 rounded-full bg-black px-8 py-4 text-lg text-white hover:bg-gray-800 disabled:opacity-50"
                        :disabled="!isSupported"
                        @click="practiceCurrentWord"
                    >
                        🎙 Start Speaking
                    </button>

                    <div v-else class="mt-10 rounded-lg bg-gray-100 px-8 py-4 text-gray-600">
                        🎙 Listening...
                    </div>

                    <p v-if="!isSupported" class="mt-4 text-sm text-red-500">
                        Speech recognition is not supported in this browser.
                    </p>
                    <p v-if="speechError" class="mt-4 text-sm text-red-500">
                        {{ speechError }}
                    </p>

                    <div class="mt-8">
                        <button type="button" class="text-sm text-gray-500 hover:text-black" @click="skipSpeaking">
                            Skip speaking →
                        </button>
                    </div>
                </div>

                <!-- RESULT -->
                <div v-else-if="phase === 'result'">
                    <p class="text-sm font-medium uppercase tracking-wide text-gray-400">
                        Result
                    </p>
                    <h2 class="mt-2 text-2xl font-bold">{{ currentWord.word }}</h2>

                    <div v-if="pronunciationScore !== null" class="mt-8">
                        <div class="text-5xl font-bold">{{ pronunciationScore }}%</div>
                        <p
                            v-if="pronunciationCorrect"
                            class="mt-3 text-lg font-semibold text-green-600"
                        >
                            ✅ Pronunciation good
                        </p>
                        <p v-else class="mt-3 text-lg font-semibold text-red-600">
                            ❌ Keep practicing pronunciation
                        </p>
                    </div>

                    <div v-if="transcript" class="mt-6 rounded-xl bg-gray-50 p-4">
                        <p class="text-sm text-gray-500">You said:</p>
                        <p class="mt-1 font-medium">{{ transcript }}</p>
                    </div>

                    <button
                        type="button"
                        class="mt-8 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800"
                        @click="nextWord"
                    >
                        {{ currentIndex === words.length - 1 ? 'Finish session' : 'Next word' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
