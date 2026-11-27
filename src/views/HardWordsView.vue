<script setup lang="ts">
import AppIcon from '../components/ui/AppIcon.vue'
import { computed, onMounted, ref, watch } from 'vue'

import { useHardWordsStore } from '../stores/hardWords'
import { useWordProgressStore } from '../stores/wordProgress'
import { useSessionSettingsStore } from '../stores/sessionSettings'

import {
    checkPronunciation,
} from '../services/pronunciation'

import {
    useSpeakingPractice,
} from '../composables/useSpeakingPractice'

import { loadManifest } from '../services/vocabulary'
import { resolveFullHardWords } from '../services/hardWordsLookup'
import type { Word } from '../types/vocabulary'

import SpeechButton from '../components/ui/SpeechButton.vue'
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'

const hardWordsStore =
    useHardWordsStore()

const wordProgressStore =
    useWordProgressStore()

const sessionSettingsStore =
    useSessionSettingsStore()

const {
    isSupported,
    isListening,
    transcript,
    error: speechError,
    startListening,
    reset,
} = useSpeakingPractice()

const search = ref('')

const words = computed(() => {
    const query = search.value.trim().toLowerCase()
    if (!query) return hardWordsStore.hardWords
    return hardWordsStore.hardWords.filter(entry =>
        `${entry.word} ${entry.meaning} ${entry.source?.context ?? ''}`.toLowerCase().includes(query)
    )
})

const currentIndex = ref(0)

watch(search, () => {
    currentIndex.value = 0
    resetPracticeState()
    phase.value = 'listen'
})

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

/*
|--------------------------------------------------------------------------
| Full Vocabulary Enrichment
|--------------------------------------------------------------------------
|
| hardWordsStore only keeps {word, meaning, addedAt} — enough to display a
| single meaning, but not pos/examples/synonyms. For words that also exist
| in the vocabulary library we fetch the full Word via the one shared
| lookup (services/hardWordsLookup.ts, same source ListenRepeatView uses)
| so multi-meaning + examples can be shown here too. Words saved from
| content outside the vocabulary library (e.g. a reading passage) stay
| unmatched and keep falling back to the lightweight {word, meaning} line —
| nothing is fabricated for them.
|
*/
const enrichedWords = ref<Map<string, Word>>(new Map())

onMounted(async () => {
    if (!hardWordsStore.hardWords.length) {
        return
    }

    try {
        const manifest = await loadManifest()

        const { found } = await resolveFullHardWords(
            hardWordsStore.hardWords.map(entry => entry.word),
            manifest
        )

        enrichedWords.value = new Map(
            found.map(word => [word.word.trim().toLowerCase(), word])
        )
    } catch (err) {
        console.error('Failed to enrich hard words:', err)
    }
})

const currentEnrichedWord = computed<Word | null>(() => {
    if (!currentWord.value) {
        return null
    }

    return enrichedWords.value.get(currentWord.value.word.trim().toLowerCase()) ?? null
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

    /* Speaking can be turned off globally — go straight to the result, matching Review Due Words / Review Words. */
    phase.value = sessionSettingsStore.settings.speakingEnabled
        ? 'speak'
        : 'result'
}

async function practiceWord() {
    if (
        !currentWord.value ||
        isListening.value ||
        !sessionSettingsStore.settings.speakingEnabled
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

    phase.value = sessionSettingsStore.settings.speakingEnabled
        ? 'speak'
        : 'result'
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

    /* Normally practice saying it again right away; with speaking off there is nothing to retry, so move on. */
    if (!sessionSettingsStore.settings.speakingEnabled) {
        nextWord()
        return
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
        <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1
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

            <button
                type="button"
                role="switch"
                :aria-checked="sessionSettingsStore.settings.speakingEnabled"
                aria-label="Speaking practice"
                class="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm transition"
                :class="sessionSettingsStore.settings.speakingEnabled
                    ? 'border-accent bg-accent text-white hover:bg-accent-strong'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-100'"
                :title="sessionSettingsStore.settings.speakingEnabled
                    ? 'Speaking step is on — click to skip it in this review'
                    : 'Speaking step is off — click to include it again'"
                @click="sessionSettingsStore.toggleSpeaking"
            >
                <AppIcon name="mic" :size="16" />
                <span>{{ sessionSettingsStore.settings.speakingEnabled ? 'Speaking on' : 'Speaking off' }}</span>
            </button>
        </div>

        <div v-if="hardWordsStore.hardWords.length" class="mb-6">
            <label for="hard-word-search" class="sr-only">Search saved words</label>
            <input
                id="hard-word-search"
                v-model="search"
                type="search"
                placeholder="Search saved words"
                class="min-h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
        </div>

        <!-- Empty -->
        <div
            v-if="!currentWord"
            class="surface px-6 py-12 text-center text-gray-500"
        >
            <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><AppIcon name="check" :size="26" /></span>

            <h2
                class="mt-4 text-xl font-semibold"
            >
                No hard words
            </h2>

            <p
                class="mt-2 text-gray-500"
            >
                {{ search ? 'No saved words match your search.' : 'Add difficult words from your vocabulary lessons.' }}
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
                        class="h-full rounded-full bg-accent transition-all"
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

                    <div v-if="currentEnrichedWord" class="mt-10 text-left">
                        <WordMeaningsBlock
                            :word="currentEnrichedWord.word"
                            :meaning="currentEnrichedWord.meaning"
                            :pos="currentEnrichedWord.pos"
                            :synonyms="currentEnrichedWord.synonyms"
                            :examples="currentEnrichedWord.examples"
                            :collocations="currentEnrichedWord.collocations"
                            :related-expressions="currentEnrichedWord.relatedExpressions"
                            :usage="currentEnrichedWord.usage"
                        />
                    </div>

                    <template v-else>
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
                        />
                    </template>

                    <div
                        class="mt-10 flex justify-center"
                    >
                        <button
                            type="button"
                            class="btn-primary btn-lg"
                            @click="
                                startThinking
                            "
                        >
                            I know this word →
                        </button>
                    </div>

                    <p v-if="currentWord?.source?.context" class="fa-text mt-4 text-sm text-gray-500" lang="fa">
                        Saved from: {{ currentWord.source.context }}
                    </p>
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
                        <WordMeaningsBlock
                            v-if="currentEnrichedWord"
                            :word="currentEnrichedWord.word"
                            :meaning="currentEnrichedWord.meaning"
                            :pos="currentEnrichedWord.pos"
                            :synonyms="currentEnrichedWord.synonyms"
                            :examples="currentEnrichedWord.examples"
                            :collocations="currentEnrichedWord.collocations"
                            :related-expressions="currentEnrichedWord.relatedExpressions"
                            :usage="currentEnrichedWord.usage"
                        />

                        <template v-else>
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
                        </template>
                    </div>

                    <p
                        v-if="sessionSettingsStore.settings.speakingEnabled"
                        class="mt-6 text-sm text-gray-500"
                    >
                        Try to remember the
                        pronunciation before
                        speaking.
                    </p>

                    <button
                        type="button"
                        class="btn-primary btn-lg mt-8"
                        @click="
                            startSpeaking
                        "
                    >
                        {{ sessionSettingsStore.settings.speakingEnabled ? 'Speak →' : 'Continue →' }}
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
                        class="mt-10 rounded-full bg-accent px-8 py-4 text-lg text-white hover:bg-accent-strong disabled:opacity-50"
                        :disabled="!isSupported"
                        @click="
                            practiceWord
                        "
                    >
                        Start Speaking
                    </button>

                    <div
                        v-else
                        class="mt-10 rounded-lg bg-gray-100 px-8 py-4 text-gray-600"
                    >
                        Listening...
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
                                Correct!
                            </p>

                            <p
                                v-else
                                class="mt-3 text-lg font-semibold text-red-600"
                            >
                                Try again
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
                                sessionSettingsStore.settings.speakingEnabled &&
                                !pronunciationCorrect
                            "
                            type="button"
                            class="rounded-lg border px-5 py-2 hover:bg-gray-50"
                            @click="
                                tryAgain
                            "
                        >
                            Try Again
                        </button>

                        <button
                            type="button"
                            class="btn-primary"
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
                            Still Difficult
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
