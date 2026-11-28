<script setup lang="ts">
import AppIcon from '../components/ui/AppIcon.vue'
import { computed, onMounted, ref } from 'vue'
import { useLocale } from '../services/locale'

import { useWordProgressStore } from '../stores/wordProgress'
import { useSessionSettingsStore } from '../stores/sessionSettings'

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
    CourseManifest,
    LessonManifest,
    Word,
} from '../types/vocabulary'

import WordRecallPrompt from '../components/learn/WordRecallPrompt.vue'
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'

const wordProgressStore =
    useWordProgressStore()

const sessionSettingsStore =
    useSessionSettingsStore()

const { t, isPersian } = useLocale()

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

const speechAttempted =
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

    phase.value = 'recall'

    pronunciationScore.value =
        null

    pronunciationCorrect.value =
        false

    answerRecorded.value =
        false

    recallAnswer.value = ''

    recallRevealed.value = false

    recallCorrect.value = false

    speechAttempted.value = false
}

/*
 * Pretesting effect: the user guesses the English
 * word from its meaning BEFORE the word is revealed.
 * This recall attempt (not the later speaking step)
 * is what drives the spaced-repetition schedule.
 */
function submitRecall() {
    if (
        !currentWord.value ||
        recallRevealed.value
    ) {
        return
    }

    recallRevealed.value = true

    recallCorrect.value =
        answersMatch(
            currentWord.value.word,
            recallAnswer.value
        )

    const progress =
        wordProgressStore.getProgress(
            currentWord.value.word,
            currentWord.value.courseId,
            currentWord.value.lessonId
        )

    if (recallCorrect.value) {
        wordProgressStore.recordCorrect(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId,
            { mode: 'recall', ctx: 'review' }
        )
    } else {
        wordProgressStore.recordWrong(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId,
            { mode: 'recall', ctx: 'review' }
        )
    }

    answerRecorded.value = true
}

function proceedToSpeak() {
    if (!currentWord.value) {
        return
    }

    /* Speaking step can be disabled — go straight to the result, matching Review Due Words. */
    phase.value = sessionSettingsStore.settings.speakingEnabled
        ? 'speak'
        : 'result'
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

    speechAttempted.value = true

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

function progressLabel(): string {
    return t('review.position', {
        current: String(currentIndex.value + 1),
        total: String(words.value.length),
    })
}

function completionLabel(): string {
    return t('review.remaining', {
        count: String(Math.max(words.value.length - currentIndex.value - 1, 0)),
    })
}

onMounted(() => {
    loadReviewWords()
})
</script>

<template>
    <div class="review-page mx-auto max-w-5xl" :dir="isPersian ? 'rtl' : 'ltr'">
        <header class="review-header rounded-[1.75rem] border border-gray-200/80 bg-white/90 p-5 shadow-[0_12px_36px_rgba(31,45,61,0.06)] sm:p-6">
            <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p class="eyebrow text-accent-ink">{{ t('review.eyebrow') }}</p>
                    <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">{{ t('review.title') }}</h1>
                    <p class="mt-2 max-w-xl text-sm leading-6 text-gray-500">{{ t('review.description') }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        role="switch"
                        :aria-checked="sessionSettingsStore.settings.speakingEnabled"
                        :aria-label="t('review.speakingToggle')"
                        class="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
                        :class="sessionSettingsStore.settings.speakingEnabled ? 'border-accent bg-accent text-white hover:bg-accent-strong' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'"
                        @click="sessionSettingsStore.toggleSpeaking"
                    >
                        <AppIcon name="mic" :size="16" />
                        <span>{{ sessionSettingsStore.settings.speakingEnabled ? t('review.speakingOn') : t('review.speakingOff') }}</span>
                    </button>
                    <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 disabled:opacity-50" :aria-label="t('review.refresh')" :disabled="loading" @click="refresh">
                        <AppIcon name="refresh" :size="16" />
                        <span class="hidden sm:inline">{{ t('review.refresh') }}</span>
                    </button>
                </div>
            </div>
        </header>

        <div v-if="error" class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ t('review.loadError') }}</div>

        <div v-if="loading" class="mt-5 rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center text-gray-500" role="status">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><AppIcon name="refresh" :size="22" /></span>
            <p class="mt-4 font-semibold text-gray-800">{{ t('review.loading') }}</p>
            <p class="mt-1 text-sm">{{ t('review.loadingDetail') }}</p>
        </div>

        <div v-else-if="!currentWord && !isCompleted" class="mt-5 rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center shadow-[0_12px_36px_rgba(31,45,61,0.05)]">
            <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><AppIcon name="check" :size="26" /></span>
            <h2 class="mt-5 font-display text-2xl font-semibold text-gray-950">{{ t('review.emptyTitle') }}</h2>
            <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{{ t('review.emptyDescription') }}</p>
        </div>

        <div v-else-if="isCompleted" class="mx-auto mt-5 max-w-2xl rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center shadow-[0_12px_36px_rgba(31,45,61,0.06)]">
            <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><AppIcon name="check" :size="30" /></span>
            <p class="eyebrow mt-6 text-emerald-700">{{ t('review.completeEyebrow') }}</p>
            <h2 class="mt-2 font-display text-3xl font-semibold text-gray-950">{{ t('review.completeTitle') }}</h2>
            <p class="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-500">{{ t('review.completeDescription') }}</p>
            <button type="button" class="btn-primary btn-lg mt-8" @click="refresh">{{ t('review.checkAgain') }}</button>
        </div>

        <main v-else class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
            <section class="min-w-0">
                <div class="mb-4 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 sm:px-5">
                    <div class="flex items-center justify-between gap-4 text-sm">
                        <div class="min-w-0">
                            <p class="font-semibold text-gray-900">{{ progressLabel() }}</p>
                            <p class="mt-0.5 text-xs text-gray-500">{{ completionLabel() }}</p>
                        </div>
                        <span class="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink">{{ progressPercent }}%</span>
                    </div>
                    <div class="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100" :aria-label="t('review.progressAria')">
                        <div class="h-full rounded-full bg-accent transition-[width] duration-300" :style="{ width: `${progressPercent}%` }" />
                    </div>
                </div>

                <article class="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_18px_50px_rgba(31,45,61,0.08)]">
                    <div class="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-7">
                        <div>
                            <p class="eyebrow text-accent-ink">{{ phase === 'recall' ? t('review.recallLabel') : phase === 'speak' ? t('review.speakingLabel') : t('review.feedbackLabel') }}</p>
                            <p class="mt-1 text-xs text-gray-400">{{ currentWord.lessonId ? currentWord.lessonId : t('review.dueWords') }}</p>
                        </div>
                        <SpeechButton :text="currentWord.word" lang="en-US" :label="t('review.playEnglish')" />
                    </div>

                    <div class="p-5 sm:p-8">
                        <div v-if="phase === 'recall'" class="max-w-2xl">
                            <h2 class="font-display text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">{{ t('review.recallTitle') }}</h2>
                            <p class="mt-2 text-sm leading-6 text-gray-500">{{ t('review.recallInstruction') }}</p>
                            <div v-if="!recallRevealed" class="mt-8 rounded-2xl bg-[#f6f7f3] px-5 py-7 text-center sm:px-8">
                                <p class="eyebrow text-gray-500">{{ t('review.meaningLabel') }}</p>
                                <div class="mt-4"><WordRecallPrompt :word="currentWord" :pool="words" /></div>
                            </div>
                            <form v-if="!recallRevealed" class="mt-5" @submit.prevent="submitRecall">
                                <label for="review-recall-answer" class="sr-only">{{ t('review.answerLabel') }}</label>
                                <input id="review-recall-answer" v-model="recallAnswer" autofocus autocomplete="off" :placeholder="t('review.answerPlaceholder')" class="field min-h-14 w-full text-center text-xl" />
                                <button type="submit" class="btn-primary btn-lg mt-4 w-full">{{ t('review.checkAnswer') }}</button>
                            </form>
                            <div v-else class="mt-7">
                                <div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 sm:p-6">
                                    <WordMeaningsBlock :word="currentWord.word" :meaning="currentWord.meaning" :pos="currentWord.pos" :synonyms="currentWord.synonyms" :examples="currentWord.examples" show-save />
                                </div>
                                <div class="mt-4 flex items-start gap-3 rounded-2xl px-4 py-3" :class="recallCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'" role="status">
                                    <AppIcon :name="recallCorrect ? 'check' : 'info'" :size="19" />
                                    <p class="text-sm font-semibold">{{ recallCorrect ? t('review.recallCorrect') : t('review.recallIncorrect', { answer: recallAnswer || t('review.noAnswer') }) }}</p>
                                </div>
                                <button type="button" class="btn-primary btn-lg mt-5 w-full" @click="proceedToSpeak">{{ sessionSettingsStore.settings.speakingEnabled ? t('review.continueSpeaking') : t('review.continueToResult') }}</button>
                            </div>
                        </div>

                        <div v-else-if="phase === 'speak'" class="max-w-2xl">
                            <div class="flex flex-col items-center text-center">
                                <p class="eyebrow text-accent-ink">{{ t('review.speakingPromptLabel') }}</p>
                                <h2 class="mt-3 font-display text-4xl font-semibold tracking-tight text-gray-950" dir="ltr" lang="en">{{ currentWord.word }}</h2>
                                <p class="mt-2 text-sm text-gray-500">{{ t('review.speakingInstruction') }}</p>
                            </div>
                            <div class="mt-7 rounded-[1.5rem] border border-gray-200 bg-[#f8faf8] p-5 text-center sm:p-7" :class="isListening ? 'ring-4 ring-accent/10' : ''">
                                <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl" :class="isListening ? 'bg-accent text-white' : 'bg-accent-soft text-accent-ink'">
                                    <AppIcon :name="isListening ? 'mic' : 'mic'" :size="34" />
                                </div>
                                <p class="mt-4 font-semibold text-gray-900">{{ isListening ? t('review.listening') : speechAttempted && speechError ? t('review.noSpeechDetected') : t('review.readyToSpeak') }}</p>
                                <p class="mt-1 text-sm text-gray-500">{{ isListening ? t('review.listeningDetail') : t('review.speakingHint') }}</p>
                                <button type="button" class="btn-primary btn-lg mt-5 min-w-48" :disabled="isListening || !isSupported" @click="practiceCurrentWord">
                                    <AppIcon name="mic" :size="18" />
                                    {{ isListening ? t('review.processing') : t('review.speakNow') }}
                                </button>
                                <p v-if="!isSupported" class="mt-3 text-sm text-red-700" role="alert">{{ t('review.speechUnsupported') }}</p>
                                <p v-else-if="speechError" class="mt-3 text-sm text-amber-800" role="status">{{ t('review.speechError') }}</p>
                            </div>
                        </div>

                        <div v-else class="max-w-2xl">
                            <div class="flex items-start gap-3 rounded-2xl p-4" :class="pronunciationCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'" role="status">
                                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="pronunciationCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"><AppIcon :name="pronunciationCorrect ? 'check' : 'info'" :size="20" /></span>
                                <div>
                                    <p class="font-semibold">{{ pronunciationCorrect ? t('review.correctTitle') : t('review.tryAgainTitle') }}</p>
                                    <p class="mt-1 text-sm opacity-80">{{ pronunciationCorrect ? t('review.correctDetail') : t('review.tryAgainDetail') }}</p>
                                </div>
                            </div>
                            <div class="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                                <WordMeaningsBlock :word="currentWord.word" :meaning="currentWord.meaning" :pos="currentWord.pos" :synonyms="currentWord.synonyms" :examples="currentWord.examples" show-save />
                                <div v-if="pronunciationScore !== null" class="rounded-2xl bg-gray-950 px-5 py-4 text-center text-white">
                                    <p class="text-3xl font-semibold tabular-nums">{{ pronunciationScore }}%</p>
                                    <p class="mt-1 text-xs text-white/60">{{ t('review.score') }}</p>
                                </div>
                            </div>
                            <div v-if="transcript" class="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3" dir="auto">
                                <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('review.recognizedAnswer') }}</p>
                                <p class="mt-1 text-lg font-semibold text-gray-900">{{ transcript }}</p>
                            </div>
                            <div class="mt-6 flex flex-col gap-3 sm:flex-row">
                                <button v-if="!pronunciationCorrect" type="button" class="min-h-12 flex-1 rounded-xl border border-gray-200 px-4 font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="tryAgain">{{ t('review.tryAgain') }}</button>
                                <button type="button" class="btn-primary min-h-12 flex-1" @click="markKnown">{{ t('review.knowIt') }}</button>
                                <button type="button" class="min-h-12 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200" @click="markDifficult">{{ t('review.stillDifficult') }}</button>
                            </div>
                        </div>
                    </div>
                </article>

                <nav class="mt-4 flex items-center justify-between gap-3" :aria-label="t('review.navigationAria')">
                    <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="previousWord"><AppIcon name="chevron-left" :size="17" />{{ t('review.previous') }}</button>
                    <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="skipWord">{{ t('review.skip') }}<AppIcon name="chevron-right" :size="17" /></button>
                </nav>
            </section>

            <aside class="hidden rounded-[1.5rem] border border-gray-200/80 bg-white/75 p-5 lg:block">
                <p class="eyebrow text-gray-400">{{ t('review.sessionInfo') }}</p>
                <p class="mt-3 font-display text-4xl font-semibold tabular-nums text-gray-950">{{ Math.max(words.length - currentIndex, 0) }}</p>
                <p class="mt-1 text-sm text-gray-500">{{ t('review.wordsRemaining') }}</p>
                <div class="my-5 h-px bg-gray-100" />
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('review.learningPath') }}</p>
                <p class="mt-2 text-sm leading-6 text-gray-700">{{ phase === 'recall' ? t('review.recallStep') : phase === 'speak' ? t('review.speakingStep') : t('review.feedbackStep') }}</p>
                <div v-if="currentProgress" class="mt-5 space-y-2 text-xs text-gray-500">
                    <div class="flex justify-between"><span>{{ t('review.level') }}</span><strong class="text-gray-800">{{ currentProgress.level }}</strong></div>
                    <div class="flex justify-between"><span>{{ t('review.streak') }}</span><strong class="text-gray-800">{{ currentProgress.streak }}</strong></div>
                </div>
            </aside>
        </main>
    </div>
</template>
