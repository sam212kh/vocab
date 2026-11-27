<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '../components/ui/AppIcon.vue'
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'
import PracticeProgress from '../components/practice/PracticeProgress.vue'

import { loadLesson, loadManifest } from '../services/vocabulary'
import { checkMeaningRecall, meaningRecallTarget } from '../services/meaningRecall'
import { useWordProgressStore } from '../stores/wordProgress'
import { useLocale } from '../services/locale'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'

import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'

const progressStore = useWordProgressStore()
const evidenceRecorder = useEvidenceRecorder()
const route = useRoute()
const { t, isPersian } = useLocale()

const courses = ref<CourseManifest[]>([])
const selectedCourseId = ref('')
const selectedLessonId = ref('')
const words = ref<Word[]>([])
const index = ref(0)
const loading = ref(false)
const error = ref('')
const started = ref(false)
const results = ref<('correct' | 'wrong')[]>([])

const inputs = ref<string[]>([])
const revealed = ref(false)
const result = ref<'correct' | 'wrong' | null>(null)
const matchedByInput = ref<boolean[]>([])

const firstInput = ref<HTMLInputElement | null>(null)
const continueButton = ref<HTMLButtonElement | null>(null)

const selectedCourse = computed(() => courses.value.find(course => course.id === selectedCourseId.value))
const availableLessons = computed(() => selectedCourse.value?.lessons ?? [])
const selectedLesson = computed<LessonManifest | null>(
    () => availableLessons.value.find(lesson => lesson.id === selectedLessonId.value) ?? null
)

const currentWord = computed(() => words.value[index.value] ?? null)
const finished = computed(() => started.value && index.value >= words.value.length)
const score = computed(() => results.value.filter(item => item === 'correct').length)

const lessonLink = computed(() =>
    selectedLesson.value ? `/courses/${selectedCourseId.value}/lessons/${selectedLessonId.value}` : '/lessons'
)

const RING = 2 * Math.PI * 52
const ringOffset = computed(() => RING * (1 - (words.value.length ? score.value / words.value.length : 0)))

/* The one source of truth for how many meanings this word has and what counts as correct — never guessed, never padded. */
const target = computed(() => (currentWord.value ? meaningRecallTarget(currentWord.value) : null))

async function focusFirstInput() {
    await nextTick()
    firstInput.value?.focus({ preventScroll: true })
}

function resetForCurrentWord() {
    inputs.value = target.value ? Array.from({ length: target.value.expectedCount }, () => '') : []
    revealed.value = false
    result.value = null
    matchedByInput.value = []
}

watch(currentWord, () => resetForCurrentWord())

async function startPractice() {
    if (!selectedLesson.value) return

    loading.value = true
    error.value = ''
    results.value = []
    started.value = false

    try {
        words.value = await loadLesson(selectedLesson.value)
        index.value = 0
        started.value = true
        resetForCurrentWord()
        await focusFirstInput()
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function checkAnswer() {
    if (!currentWord.value || !target.value || revealed.value) return

    const outcome = checkMeaningRecall(inputs.value, target.value.accepted)

    revealed.value = true
    matchedByInput.value = outcome.matchedByInput
    result.value = outcome.allCorrect ? 'correct' : 'wrong'
    results.value.push(result.value)

    const word = currentWord.value

    if (outcome.allCorrect) {
        progressStore.recordCorrect(word.word, word.courseId, word.lessonId, { mode: 'recall', ctx: 'meaning-recall' })
    } else {
        progressStore.recordWrong(word.word, word.courseId, word.lessonId, { mode: 'recall', ctx: 'meaning-recall' })
    }
    evidenceRecorder.recordVocabularyRecall(word.word, outcome.allCorrect, 'meaning-recall')

    void nextTick().then(() => continueButton.value?.focus({ preventScroll: true }))
}

async function next() {
    if (!words.value.length) return

    index.value++

    if (index.value < words.value.length) await focusFirstInput()
}

function chooseAnotherLesson() {
    started.value = false
    words.value = []
    index.value = 0
    results.value = []
}

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses

        const queryCourseId = String(route.query.courseId ?? '')
        const queryLessonId = String(route.query.lessonId ?? '')
        const hasQueryCourse = courses.value.some(course => course.id === queryCourseId)

        selectedCourseId.value = hasQueryCourse ? queryCourseId : (courses.value[0]?.id ?? '')

        if (hasQueryCourse && availableLessons.value.some(lesson => lesson.id === queryLessonId)) {
            selectedLessonId.value = queryLessonId
            await startPractice()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <div>
        <!-- ============ SETUP ============ -->
        <section v-if="!started" class="mx-auto max-w-xl">
            <p class="inline-flex rounded-full bg-practice-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-practice-700">{{ t('meaningRecall.eyebrow') }}</p>
            <h1 class="mt-3 text-ink">{{ t('meaningRecall.heading') }}</h1>
            <p class="mt-2 text-ink-soft" :lang="isPersian ? 'fa' : 'en'">{{ t('meaningRecall.subheading') }}</p>

            <form class="mt-6 space-y-4 rounded-3xl border border-work-line bg-white p-5 shadow-soft sm:p-6" @submit.prevent="startPractice">
                <label class="block text-sm font-medium text-ink">
                    {{ t('meaningRecall.course') }}
                    <select
                        v-model="selectedCourseId"
                        class="mt-1.5 min-h-12 w-full rounded-xl border border-work-line bg-white px-3 outline-none focus:border-practice-500 focus:ring-4 focus:ring-practice-500/20"
                        @change="selectedLessonId = ''"
                    >
                        <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.title }}</option>
                    </select>
                </label>

                <label class="block text-sm font-medium text-ink">
                    {{ t('meaningRecall.lesson') }}
                    <select
                        v-model="selectedLessonId"
                        class="mt-1.5 min-h-12 w-full rounded-xl border border-work-line bg-white px-3 outline-none focus:border-practice-500 focus:ring-4 focus:ring-practice-500/20"
                    >
                        <option value="">{{ t('meaningRecall.selectLesson') }}</option>
                        <option v-for="lesson in availableLessons" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option>
                    </select>
                </label>

                <button
                    type="submit"
                    class="min-h-12 w-full rounded-2xl bg-practice-600 px-4 font-semibold text-white transition hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40 disabled:opacity-50"
                    :disabled="loading || !selectedLessonId"
                >
                    {{ loading ? t('meaningRecall.loading') : t('meaningRecall.start') }}
                </button>

                <p v-if="error" class="rounded-xl bg-bad-50 p-3 text-sm text-bad-600" role="alert">{{ error }}</p>
            </form>
        </section>

        <!-- ============ SESSION / RESULT ============ -->
        <section v-else class="mx-auto flex min-h-[calc(100svh-5.5rem)] max-w-xl flex-col md:min-h-[calc(100svh-4rem)]">
            <h1 class="sr-only">{{ t('meaningRecall.heading') }}{{ selectedLesson ? `: ${selectedLesson.title}` : '' }}</h1>
            <header class="flex items-center gap-3">
                <RouterLink
                    :to="lessonLink"
                    class="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/30"
                    :aria-label="t('meaningRecall.leave')"
                >
                    <AppIcon name="close" />
                </RouterLink>

                <PracticeProgress :total="words.length" :current="index" :results="results" />

                <span class="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-soft" aria-label="Score">{{ score }}</span>
            </header>

            <!-- Result -->
            <div v-if="finished" class="flex flex-1 flex-col justify-center py-8 text-center">
                <div class="relative mx-auto h-36 w-36">
                    <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90" aria-hidden="true">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="#dde2ee" stroke-width="9" />
                        <circle
                            cx="60" cy="60" r="52" fill="none" stroke="#5560e8" stroke-width="9" stroke-linecap="round"
                            :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" class="motion-safe-only transition-all duration-700"
                        />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-3xl font-bold tabular-nums text-ink">{{ score }}<span class="text-lg font-medium text-ink-faint"> / {{ words.length }}</span></span>
                    </div>
                </div>

                <h2 class="mt-5 text-2xl font-bold text-ink">{{ t('meaningRecall.complete') }}</h2>
                <p class="mt-1 text-sm text-ink-soft">{{ t('meaningRecall.completeSubtext') }}</p>

                <div class="mt-6 flex flex-col gap-2">
                    <RouterLink :to="lessonLink" class="flex min-h-12 items-center justify-center rounded-2xl bg-practice-600 px-5 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40">
                        Continue the lesson
                    </RouterLink>
                    <button type="button" class="min-h-12 rounded-2xl bg-practice-600 px-5 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40" @click="startPractice">
                        {{ t('meaningRecall.practiceAgain') }}
                    </button>
                    <button type="button" class="min-h-11 text-sm font-medium text-practice-700 hover:text-practice-600" @click="chooseAnotherLesson">
                        {{ t('meaningRecall.chooseAnother') }}
                    </button>
                </div>
            </div>

            <!-- Task -->
            <template v-else-if="currentWord && target">
                <div class="flex flex-1 flex-col justify-center py-8">
                    <p class="text-center text-xs font-semibold uppercase tracking-[0.12em] text-practice-700">
                        {{ index + 1 }} / {{ words.length }}
                        <span v-if="currentWord.pos" class="ml-1 rounded-full bg-practice-100 px-2 py-0.5 normal-case tracking-normal">{{ currentWord.pos }}</span>
                    </p>

                    <h2 class="wrap-anywhere mt-3 text-center text-4xl font-bold text-ink" dir="ltr" lang="en">{{ currentWord.word }}</h2>

                    <p class="fa-text mt-4 text-center text-sm text-ink-soft" lang="fa">
                        {{ target.expectedCount <= 1 ? t('meaningRecall.promptOne') : t('meaningRecall.promptMany', { count: String(target.expectedCount) }) }}
                    </p>

                    <form class="mt-6 space-y-3" @submit.prevent="revealed ? next() : inputs.some(v => v.trim()) && checkAnswer()">
                        <input
                            v-for="(_, boxIndex) in inputs"
                            :key="boxIndex"
                            :ref="boxIndex === 0 ? (el => { firstInput = el as HTMLInputElement }) : undefined"
                            v-model="inputs[boxIndex]"
                            :disabled="revealed"
                            autocomplete="off"
                            autocapitalize="off"
                            autocorrect="off"
                            spellcheck="false"
                            enterkeyhint="done"
                            dir="rtl"
                            lang="fa"
                            :aria-label="`${t('meaningRecall.placeholder')} ${boxIndex + 1}`"
                            :placeholder="t('meaningRecall.placeholder')"
                            class="fa-text w-full rounded-2xl border bg-white px-4 py-4 text-center text-xl outline-none transition focus:ring-4"
                            :class="revealed
                                ? matchedByInput[boxIndex]
                                    ? 'border-good-600 bg-good-50 text-good-600'
                                    : 'border-bad-600 bg-bad-50 text-bad-600'
                                : 'border-work-line focus:border-practice-500 focus:ring-practice-500/20'"
                        />
                    </form>
                </div>

                <!-- Feedback + actions, anchored to the thumb zone -->
                <div class="sticky bottom-0 -mx-4 bg-gradient-to-t from-work from-75% to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6 md:mx-0 md:px-0">
                    <div
                        v-if="revealed"
                        class="mb-3 rounded-2xl border p-4"
                        :class="result === 'correct' ? 'border-good-600/25 bg-good-50' : 'border-bad-600/25 bg-bad-50'"
                        role="status"
                        data-testid="feedback"
                    >
                        <p class="flex items-center gap-2 font-semibold" :class="result === 'correct' ? 'text-good-600' : 'text-bad-600'">
                            <AppIcon :name="result === 'correct' ? 'check' : 'close'" :size="18" />
                            {{ result === 'correct' ? t('meaningRecall.correct') : t('meaningRecall.notQuite') }}
                        </p>

                        <div class="mt-3 border-t pt-3" :class="result === 'correct' ? 'border-good-600/15' : 'border-bad-600/15'">
                            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{{ t('meaningRecall.verifiedMeanings') }}</p>
                            <div class="mt-2">
                                <WordMeaningsBlock
                                    :word="currentWord.word"
                                    :meaning="currentWord.meaning"
                                    :pos="currentWord.pos"
                                    :synonyms="currentWord.synonyms"
                                    :examples="currentWord.examples"
                                    :show-audio="false"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button
                            v-if="!revealed"
                            type="button"
                            class="min-h-12 flex-1 rounded-2xl bg-practice-600 px-4 font-semibold text-white transition hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40 disabled:bg-practice-600/40"
                            :disabled="!inputs.some(v => v.trim())"
                            @click="checkAnswer"
                        >
                            {{ t('meaningRecall.check') }}
                        </button>
                        <button
                            v-else
                            ref="continueButton"
                            type="button"
                            class="min-h-12 flex-1 rounded-2xl px-4 font-semibold text-white transition focus-visible:outline-none focus-visible:ring-4"
                            :class="result === 'correct' ? 'bg-good-600 hover:bg-good-600/90 focus-visible:ring-good-600/40' : 'bg-practice-600 hover:bg-practice-700 focus-visible:ring-practice-500/40'"
                            @click="next"
                        >
                            {{ index >= words.length - 1 ? t('meaningRecall.seeResults') : t('meaningRecall.continue') }}
                        </button>
                    </div>
                </div>
            </template>
        </section>
    </div>
</template>
