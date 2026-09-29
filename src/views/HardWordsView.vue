<script setup lang="ts">
import { computed, ref } from 'vue'

import { useHardWordsStore } from '../stores/hardWords'
import { useWordProgressStore } from '../stores/wordProgress'

import {
    checkPronunciation,
} from '../services/pronunciation'

import {
    useSpeakingPractice,
} from '../composables/useSpeakingPractice'

import SpeechButton from '../components/ui/SpeechButton.vue'

const hardWordsStore =
    useHardWordsStore()

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

const words = computed(() => {
    return hardWordsStore.hardWords
})

const currentIndex = ref(0)

const phase = ref<
    'listen' |
    'think' |
    'speak' |
    'result'
>('listen')

const pronunciationScore =
    ref<number | null>(null)

const pronunciationCorrect =
    ref(false)

const answerRecorded =
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

function resetPracticeState() {
    reset()

    pronunciationScore.value =
        null

    pronunciationCorrect.value =
        false

    answerRecorded.value =
        false
}

function startThinking() {
    phase.value = 'think'
}

function startSpeaking() {
    resetPracticeState()

    phase.value = 'speak'
}

async function practiceWord() {
    if (
        !currentWord.value ||
        isListening.value
    ) {
        return
    }

    resetPracticeState()

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

    answerRecorded.value =
        true

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
     * If Speaking Practice already
     * recorded the answer, do not
     * record it again.
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

    nextWord()
}

function markDifficult() {
    if (!currentWord.value) {
        return
    }

    /*
     * If Speaking Practice already
     * recorded the wrong answer,
     * do not record it again.
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

    resetPracticeState()

    phase.value = 'speak'
}

function nextWord() {
    resetPracticeState()

    if (!words.value.length) {
        return
    }

    if (
        currentIndex.value <
        words.value.length - 1
    ) {
        currentIndex.value++

        phase.value = 'listen'

        return
    }

    currentIndex.value = 0

    phase.value = 'listen'
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

    phase.value = 'listen'
}

function removeCurrentWord() {
    if (!currentWord.value) {
        return
    }

    const word =
        currentWord.value.word

    hardWordsStore.removeWord(word)

    resetPracticeState()

    if (!words.value.length) {
        currentIndex.value = 0

        return
    }

    if (
        currentIndex.value >=
        words.value.length
    ) {
        currentIndex.value =
            words.value.length - 1
    }

    phase.value = 'listen'
}
</script>

<template>
    <div>
        <!-- Header -->
        <div class="mb-8">
            <h1
                class="text-3xl font-bold"
            >
                Hard Words Practice
            </h1>

            <p
                class="mt-2 text-gray-500"
            >
                Practice the words you find
                difficult.
            </p>
        </div>

        <!-- Empty -->
        <div
            v-if="!currentWord"
            class="rounded-xl border border-dashed p-12 text-center"
        >
            <div class="text-5xl">
                🎉
            </div>

            <h2
                class="mt-4 text-xl font-semibold"
            >
                No hard words
            </h2>

            <p
                class="mt-2 text-gray-500"
            >
                Add difficult words from your
                vocabulary lessons.
            </p>
        </div>

        <!-- Practice -->
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
                        class="h-full rounded-full bg-black transition-all"
                        :style="{
                            width:
                                `${progressPercent}%`,
                        }"
                    />
                </div>
            </div>

            <!-- Card -->
            <div
                class="rounded-2xl border bg-white p-8 shadow-sm"
            >
                <!-- LISTEN -->
                <div
                    v-if="phase === 'listen'"
                    class="text-center"
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Step 1
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Listen
                    </h2>

                    <div
                        class="mt-10 flex items-center justify-center gap-3"
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

                    <div
                        class="mt-10 flex justify-center"
                    >
                        <button
                            type="button"
                            class="rounded-lg bg-black px-7 py-3 text-white hover:bg-gray-800"
                            @click="
                                startThinking
                            "
                        >
                            I know this word →
                        </button>
                    </div>
                </div>

                <!-- THINK -->
                <div
                    v-else-if="
                        phase === 'think'
                    "
                    class="text-center"
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Step 2
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Think
                    </h2>

                    <div
                        class="mt-10 rounded-xl bg-gray-50 p-8"
                    >
                        <p
                            class="text-4xl font-bold"
                        >
                            {{ currentWord.word }}
                        </p>

                        <p
                            class="mt-5 text-lg text-gray-600"
                        >
                            {{ currentWord.meaning }}
                        </p>
                    </div>

                    <p
                        class="mt-6 text-sm text-gray-500"
                    >
                        Try to remember the
                        pronunciation before
                        speaking.
                    </p>

                    <button
                        type="button"
                        class="mt-8 rounded-lg bg-black px-7 py-3 text-white hover:bg-gray-800"
                        @click="
                            startSpeaking
                        "
                    >
                        🎙 Speak →
                    </button>
                </div>

                <!-- SPEAK -->
                <div
                    v-else-if="
                        phase === 'speak'
                    "
                    class="text-center"
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Step 3
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Speak
                    </h2>

                    <div
                        class="mt-10"
                    >
                        <p
                            class="text-4xl font-bold"
                        >
                            {{ currentWord.word }}
                        </p>

                        <p
                            class="mt-4 text-gray-500"
                        >
                            Say the word clearly.
                        </p>
                    </div>

                    <button
                        v-if="!isListening"
                        type="button"
                        class="mt-10 rounded-full bg-black px-8 py-4 text-lg text-white hover:bg-gray-800 disabled:opacity-50"
                        :disabled="!isSupported"
                        @click="
                            practiceWord
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
                </div>

                <!-- RESULT -->
                <div
                    v-else-if="
                        phase === 'result'
                    "
                    class="text-center"
                >
                    <p
                        class="text-sm font-medium uppercase tracking-wide text-gray-400"
                    >
                        Step 4
                    </p>

                    <h2
                        class="mt-2 text-2xl font-bold"
                    >
                        Result
                    </h2>

                    <div
                        class="mt-8"
                    >
                        <p
                            class="text-4xl font-bold"
                        >
                            {{ currentWord.word }}
                        </p>

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

                <!-- Navigation -->
                <div
                    class="mt-10 flex justify-between border-t pt-6"
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
                        class="text-sm text-red-500 hover:underline"
                        @click="
                            removeCurrentWord
                        "
                    >
                        Remove Hard Word
                    </button>

                    <button
                        type="button"
                        class="text-sm text-gray-500 hover:text-black"
                        @click="
                            nextWord
                        "
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>