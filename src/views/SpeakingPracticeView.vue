<script setup lang="ts">
function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

import { computed, onMounted, ref } from 'vue'
import { useLocale } from '../services/locale'

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
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'
import AppIcon from '../components/ui/AppIcon.vue'

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
const speechAttempted = ref(false)
const reviewMode = ref(false)
const wordProgressStore =
    useWordProgressStore()

const { t, isPersian } = useLocale()

const {
    isSupported,
    isListening,
    transcript,
    confidence,
    error: speechError,
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

const displayedWords = computed(() => {
    if (!reviewMode.value) return words.value

    return [...words.value].sort((a, b) => {
        const aProgress = wordProgressStore.getProgress(a.word)
        const bProgress = wordProgressStore.getProgress(b.word)
        return bProgress.practicePriority - aProgress.practicePriority
    })
})

const currentWord = computed(() => {
    return displayedWords.value[currentIndex.value] ?? null
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
    if (!displayedWords.value.length) {
        return 0
    }

    return (
            ((currentIndex.value + 1) /
            displayedWords.value.length) *
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
    speechAttempted.value = false
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
    speechAttempted.value = true

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

    if (!displayedWords.value.length) {
        return
    }

    currentIndex.value =
        (currentIndex.value + 1) %
        displayedWords.value.length
}

function previousWord() {
    resetPractice()

    if (!displayedWords.value.length) {
        return
    }

    currentIndex.value =
        currentIndex.value === 0
            ? displayedWords.value.length - 1
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


</script>

<template>
    <div class="speaking-page mx-auto max-w-5xl" :dir="isPersian ? 'rtl' : 'ltr'">
        <header class="rounded-[1.75rem] border border-gray-200/80 bg-white/90 p-5 shadow-[0_12px_36px_rgba(31,45,61,0.06)] sm:p-6">
            <div class="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                    <p class="eyebrow text-accent-ink">{{ t('speaking.eyebrow') }}</p>
                    <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">{{ t('speaking.title') }}</h1>
                    <p class="mt-2 max-w-xl text-sm leading-6 text-gray-500">{{ t('speaking.description') }}</p>
                </div>
                <button v-if="words.length" type="button" class="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="reviewMode = !reviewMode">{{ reviewMode ? t('speaking.showAll') : t('speaking.reviewWeak') }}</button>
            </div>
            <div class="mt-6 grid gap-3 md:grid-cols-2">
                <div>
                    <label for="speaking-course" class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('speaking.course') }}</label>
                    <select id="speaking-course" v-model="selectedCourseId" class="field min-h-12 w-full" @change="changeCourse">
                        <option value="">{{ t('speaking.selectCourse') }}</option>
                        <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.title }}</option>
                    </select>
                </div>
                <div>
                    <label for="speaking-lesson" class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('speaking.lesson') }}</label>
                    <select id="speaking-lesson" v-model="selectedLessonId" class="field min-h-12 w-full" :disabled="!selectedCourseId" @change="loadSelectedLesson">
                        <option value="">{{ t('speaking.selectLesson') }}</option>
                        <option v-for="item in availableLessons" :key="item.id" :value="item.id">{{ item.title }}</option>
                    </select>
                </div>
            </div>
        </header>

        <div v-if="error" class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ t('speaking.loadError') }}</div>

        <div v-if="loading" class="mt-5 rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center" role="status">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><AppIcon name="refresh" :size="22" /></span>
            <p class="mt-4 font-semibold text-gray-800">{{ t('speaking.loading') }}</p>
        </div>

        <div v-else-if="!currentWord" class="mt-5 rounded-[1.75rem] border border-gray-200 bg-white px-6 py-16 text-center shadow-[0_12px_36px_rgba(31,45,61,0.05)]">
            <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"><AppIcon name="mic" :size="25" /></span>
            <h2 class="mt-5 font-display text-2xl font-semibold text-gray-950">{{ t('speaking.chooseTitle') }}</h2>
            <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{{ t('speaking.chooseDescription') }}</p>
        </div>

        <main v-else class="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
            <section class="min-w-0">
                <div class="mb-4 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 sm:px-5">
                    <div class="flex items-center justify-between text-sm">
                        <div><p class="font-semibold text-gray-900">{{ t('speaking.position', { current: String(currentIndex + 1), total: String(displayedWords.length) }) }}</p><p class="mt-0.5 text-xs text-gray-500">{{ lesson?.title }}</p></div>
                        <span class="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink">{{ Math.round(progress) }}%</span>
                    </div>
                    <div class="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" :aria-label="t('speaking.progressAria')"><div class="h-full rounded-full bg-accent transition-[width] duration-300" :style="{ width: `${progress}%` }" /></div>
                </div>

                <article class="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-[0_18px_50px_rgba(31,45,61,0.08)]">
                    <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-7">
                        <div><p class="eyebrow text-accent-ink">{{ t('speaking.wordLabel') }}</p><p class="mt-1 text-xs text-gray-400">{{ reviewMode ? t('speaking.weakWords') : t('speaking.lessonPractice') }}</p></div>
                        <SpeechButton :text="currentWord.word" lang="en-US" :label="t('speaking.playPronunciation')" />
                    </div>
                    <div class="p-5 sm:p-8">
                        <div class="rounded-2xl bg-[#f6f7f3] p-5 sm:p-7">
                            <div class="flex flex-wrap items-start justify-between gap-4">
                                <div><p class="eyebrow text-gray-400">{{ t('speaking.targetWord') }}</p><h2 class="mt-3 font-display text-4xl font-semibold tracking-tight text-gray-950" dir="ltr" lang="en">{{ currentWord.word }}</h2></div>
                                <span v-if="currentProgress" class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500">{{ currentProgress.status }}</span>
                            </div>
                            <div class="mt-6"><WordMeaningsBlock :word="currentWord.word" :meaning="currentWord.meaning" :pos="currentWord.pos" :synonyms="currentWord.synonyms" :examples="currentWord.examples" show-save /></div>
                        </div>

                        <div class="mt-5 rounded-[1.5rem] border border-gray-200 p-5 text-center sm:p-7" :class="isListening ? 'ring-4 ring-accent/10' : ''">
                            <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl" :class="isListening ? 'bg-accent text-white' : 'bg-accent-soft text-accent-ink'"><AppIcon name="mic" :size="30" /></div>
                            <p class="mt-4 font-semibold text-gray-900">{{ isListening ? t('speaking.listening') : speechAttempted && !transcript && speechError ? t('speaking.noSpeech') : t('speaking.ready') }}</p>
                            <p class="mt-1 text-sm text-gray-500">{{ isListening ? t('speaking.listeningDetail') : t('speaking.instruction') }}</p>
                            <button type="button" class="btn-primary btn-lg mt-5 min-w-48" :disabled="isListening || !isSupported" @click="practiceWord"><AppIcon name="mic" :size="18" />{{ isListening ? t('speaking.processing') : t('speaking.speakNow') }}</button>
                            <p v-if="!isSupported" class="mt-3 text-sm text-red-700" role="alert">{{ t('speaking.unsupported') }}</p>
                        </div>

                        <div v-if="transcript" class="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3" dir="auto">
                            <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('speaking.recognized') }}</p>
                            <p class="mt-1 text-lg font-semibold text-gray-900">{{ transcript }}</p>
                            <p class="mt-1 text-xs text-gray-500">{{ t('speaking.confidence', { value: String(Math.round(confidence * 100)) }) }}</p>
                        </div>

                        <div v-if="pronunciationScore !== null" class="mt-5 flex items-start gap-3 rounded-2xl p-4" :class="pronunciationCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950'" role="status">
                            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="pronunciationCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"><AppIcon :name="pronunciationCorrect ? 'check' : 'help'" :size="20" /></span>
                            <div><p class="font-semibold">{{ pronunciationCorrect ? t('speaking.correct') : t('speaking.tryAgain') }}</p><p class="mt-1 text-sm opacity-80">{{ t('speaking.score', { score: String(pronunciationScore) }) }}</p></div>
                        </div>

                        <div class="mt-6 grid gap-3 sm:grid-cols-3">
                            <button type="button" class="min-h-12 rounded-xl border border-gray-200 px-4 font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="previousWord">{{ t('speaking.previous') }}</button>
                            <button type="button" class="min-h-12 rounded-xl border border-gray-200 px-4 font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25" @click="resetPractice">{{ t('speaking.retry') }}</button>
                            <button type="button" class="btn-primary min-h-12" @click="nextWord">{{ t('speaking.next') }}</button>
                        </div>
                    </div>
                </article>
            </section>
            <aside class="hidden rounded-[1.5rem] border border-gray-200/80 bg-white/75 p-5 lg:block">
                <p class="eyebrow text-gray-400">{{ t('speaking.sessionInfo') }}</p>
                <p class="mt-3 font-display text-4xl font-semibold tabular-nums text-gray-950">{{ displayedWords.length - currentIndex }}</p>
                <p class="mt-1 text-sm text-gray-500">{{ t('speaking.wordsRemaining') }}</p>
                <div class="my-5 h-px bg-gray-100" />
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">{{ t('speaking.keepInMind') }}</p>
                <p class="mt-2 text-sm leading-6 text-gray-700">{{ t('speaking.keepInMindText') }}</p>
            </aside>
        </main>
    </div>
</template>
