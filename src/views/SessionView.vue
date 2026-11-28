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
    Word,
} from '../types/vocabulary'

import SpeechButton from '../components/ui/SpeechButton.vue'
import WordRecallPrompt from '../components/learn/WordRecallPrompt.vue'
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'

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

const sessionSettingsStore = useSessionSettingsStore()
const { t, isPersian } = useLocale()

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
            progress.lessonId,
            { mode: 'recall', ctx: 'session' }
        )
    } else {
        wordProgressStore.recordWrong(
            currentWord.value.word,
            progress.courseId,
            progress.lessonId,
            { mode: 'recall', ctx: 'session' }
        )
    }

    answerRecorded.value = true
}

function proceedToSpeak() {
    if (!currentWord.value) {
        return
    }

    /* Speaking step can be disabled — go straight to the result. */
    phase.value = sessionSettingsStore.settings.speakingEnabled
        ? 'speak'
        : 'result'
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
    <div class="session-page mx-auto max-w-5xl" :dir="isPersian ? 'rtl' : 'ltr'">
        <header class="rounded-[1.75rem] border border-gray-200/80 bg-white/90 p-5 shadow-[0_12px_36px_rgba(31,45,61,0.06)] sm:p-6">
            <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p class="eyebrow text-accent-ink">{{ t('session.eyebrow') }}</p>
                    <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">{{ t('session.title') }}</h1>
                    <p class="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{{ t('session.description') }}</p>
                </div>
                <button type="button" role="switch" :aria-checked="sessionSettingsStore.settings.speakingEnabled" :aria-label="t('session.speakingToggle')" class="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" :class="sessionSettingsStore.settings.speakingEnabled ? 'border-accent bg-accent text-white hover:bg-accent-strong' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'" :title="sessionSettingsStore.settings.speakingEnabled ? t('session.speakingOnTitle') : t('session.speakingOffTitle')" @click="sessionSettingsStore.toggleSpeaking"><AppIcon name="mic" :size="16" /><span>{{ sessionSettingsStore.settings.speakingEnabled ? t('session.speakingOn') : t('session.speakingOff') }}</span></button>
            </div>
        </header>

        <div v-if="error" class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ t('session.loadError') }}</div>
        <div v-if="loading" class="mt-5 rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center" role="status"><span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><AppIcon name="refresh" :size="22" /></span><p class="mt-4 font-semibold text-gray-800">{{ t('session.loading') }}</p></div>

        <div v-else-if="isCompleted" class="mx-auto mt-5 max-w-2xl rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center shadow-[0_12px_36px_rgba(31,45,61,0.06)]"><span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><AppIcon name="check" :size="30" /></span><p class="eyebrow mt-6 text-emerald-700">{{ t('session.completeTitle') }}</p><p class="mt-3 text-sm text-gray-500">{{ t('session.completeDescription', { due: String(dueCount), fresh: String(newCount) }) }}</p><button type="button" class="btn-primary btn-lg mt-8" @click="restart">{{ t('session.startAnother') }}</button></div>

        <main v-else-if="currentWord" class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
            <section class="min-w-0">
                <div class="mb-4 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 sm:px-5"><div class="flex items-center justify-between gap-4 text-sm"><div><p class="font-semibold text-gray-900">{{ t('session.position', { current: String(currentIndex + 1), total: String(words.length) }) }}</p><p class="mt-0.5 text-xs text-gray-500">{{ dueCount }} {{ t('session.dueShort') }} · {{ newCount }} {{ t('session.newShort') }}</p></div><span class="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink">{{ progressPercent }}%</span></div><div class="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" :aria-label="t('session.progressAria')" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full bg-accent transition-[width] duration-300" :style="{ width: `${progressPercent}%` }" /></div></div>

                <article class="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_18px_50px_rgba(31,45,61,0.08)]">
                    <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7"><div><p class="eyebrow text-accent-ink">{{ phase === 'recall' ? t('session.recallLabel') : phase === 'speak' ? t('session.speakLabel') : t('session.resultLabel') }}</p><p class="mt-1 text-xs text-gray-400">{{ currentWord.pos }}</p></div><SpeechButton :text="currentWord.word" lang="en-US" :label="t('session.playEnglish')" /></div>
                    <div class="p-5 sm:p-8">
                        <div v-if="phase === 'recall'">
                            <h2 class="font-display text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">{{ t('session.recallTitle') }}</h2><p class="mt-2 text-sm leading-6 text-gray-500">{{ t('session.recallInstruction') }}</p>
                            <div class="mt-7 rounded-2xl bg-[#f6f7f3] px-5 py-7 text-center sm:px-8"><p class="eyebrow text-gray-500">{{ t('session.meaningLabel') }}</p><div class="mt-4"><WordRecallPrompt :word="currentWord" :pool="words" /></div><SpeechButton :text="currentWord.meaning" lang="fa-IR" :label="t('session.playPersian')" /></div>
                            <form v-if="!recallRevealed" class="mt-5" @submit.prevent="submitRecall"><label for="session-answer" class="sr-only">{{ t('session.answerLabel') }}</label><input id="session-answer" v-model="recallAnswer" autofocus autocomplete="off" :placeholder="t('session.answerPlaceholder')" class="field min-h-14 w-full text-center text-xl" /><button type="submit" class="btn-primary btn-lg mt-4 w-full">{{ t('session.check') }}</button></form>
                            <div v-else class="mt-6"><div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-5"><WordMeaningsBlock :word="currentWord.word" :meaning="currentWord.meaning" :pos="currentWord.pos" :synonyms="currentWord.synonyms" :examples="currentWord.examples" show-save /></div><div class="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900" role="status"><AppIcon :name="recallCorrect ? 'check' : 'help'" :size="19" /><p class="text-sm font-semibold">{{ recallCorrect ? t('session.correct') : t('session.said', { answer: recallAnswer || t('session.noAnswer') }) }}</p></div><button type="button" class="btn-primary btn-lg mt-5 w-full" @click="proceedToSpeak">{{ sessionSettingsStore.settings.speakingEnabled ? t('session.continueSpeaking') : t('session.continue') }}</button></div>
                        </div>
                        <div v-else-if="phase === 'speak'">
                            <div class="text-center"><p class="eyebrow text-accent-ink">{{ t('session.speakLabel') }}</p><h2 class="mt-3 font-display text-4xl font-semibold tracking-tight text-gray-950" dir="ltr" lang="en">{{ currentWord.word }}</h2><p class="mt-2 text-sm text-gray-500">{{ t('session.speakingInstruction') }}</p></div>
                            <div class="mt-7 rounded-[1.5rem] border border-gray-200 bg-[#f8faf8] p-6 text-center"><div class="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent-soft text-accent-ink"><AppIcon name="mic" :size="34" /></div><p class="mt-4 font-semibold text-gray-900">{{ isListening ? t('session.listening') : t('session.readyToSpeak') }}</p><button v-if="!isListening" type="button" class="btn-primary btn-lg mt-5 min-w-48" :disabled="!isSupported" @click="practiceCurrentWord"><AppIcon name="mic" :size="18" />{{ t('session.startSpeaking') }}</button><div v-else class="mt-5 font-semibold text-accent-ink">{{ t('session.listening') }}</div><p v-if="!isSupported" class="mt-3 text-sm text-red-700" role="alert">{{ t('session.speechUnsupported') }}</p><p v-else-if="speechError" class="mt-3 text-sm text-amber-800" role="status">{{ t('session.speechError') }}</p></div><button type="button" class="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50" @click="skipSpeaking">{{ t('session.skipSpeaking') }}</button>
                        </div>
                        <div v-else>
                            <div class="flex items-start gap-3 rounded-2xl p-4" :class="pronunciationCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'" role="status"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="pronunciationCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"><AppIcon :name="pronunciationCorrect ? 'check' : 'help'" :size="20" /></span><div><p class="font-semibold">{{ pronunciationCorrect ? t('session.pronunciationGood') : t('session.keepPracticing') }}</p><p v-if="pronunciationScore !== null" class="mt-1 text-sm opacity-80">{{ t('session.score', { score: String(pronunciationScore) }) }}</p></div></div><div class="mt-5 rounded-2xl border border-gray-100 bg-gray-50/80 p-5"><WordMeaningsBlock :word="currentWord.word" :meaning="currentWord.meaning" :pos="currentWord.pos" :synonyms="currentWord.synonyms" :examples="currentWord.examples" show-save /></div><div v-if="transcript" class="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3" dir="auto"><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('session.youSaid') }}</p><p class="mt-1 text-lg font-semibold text-gray-900">{{ transcript }}</p></div><button type="button" class="btn-primary btn-lg mt-5 w-full" @click="nextWord">{{ currentIndex === words.length - 1 ? t('session.finish') : t('session.next') }}</button>
                        </div>
                    </div>
                </article>
            </section>
            <aside class="hidden rounded-[1.5rem] border border-gray-200/80 bg-white/75 p-5 lg:block"><p class="eyebrow text-gray-400">{{ t('session.sessionInfo') }}</p><p class="mt-3 font-display text-4xl font-semibold tabular-nums text-gray-950">{{ words.length - currentIndex }}</p><p class="mt-1 text-sm text-gray-500">{{ t('session.wordsRemaining') }}</p><div class="my-5 h-px bg-gray-100" /><p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('session.learningPath') }}</p><p class="mt-2 text-sm leading-6 text-gray-700">{{ phase === 'recall' ? t('session.recallStep') : phase === 'speak' ? t('session.speakingStep') : t('session.feedbackStep') }}</p></aside>
        </main>
    </div>
</template>
