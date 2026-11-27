<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LearnStage from '../components/learn/LearnStage.vue'
import AppIcon from '../components/ui/AppIcon.vue'

import { loadLesson, loadManifest } from '../services/vocabulary'
import { calculateLessonProgress } from '../services/lessonProgress'
import { itemFromWord, parseWordIndex } from '../services/learnItems'
import type { LearnItem } from '../services/learnItems'

import { useHardWordsStore } from '../stores/hardWords'
import { useLearningPositionStore } from '../stores/learningPosition'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'
import { useWordProgressStore } from '../stores/wordProgress'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { guidedStepStatuses, lessonComplete, nextGuidedStep } from '../services/guidedLearning'

import type { LessonManifest, Word } from '../types/vocabulary'

const route = useRoute()
const router = useRouter()

const hardWordsStore = useHardWordsStore()
const wordProgressStore = useWordProgressStore()
const positionStore = useLearningPositionStore()
const evidenceRecorder = useEvidenceRecorder()
const evidenceStore = useLearningEvidenceStore()

function onView(item: LearnItem) {
    evidenceRecorder.expose(item.id, 'word', `${courseId.value}/${lessonId.value}`)
}

const lesson = ref<LessonManifest | null>(null)
const courseLessons = ref<LessonManifest[]>([])
const words = ref<Word[]>([])
const loading = ref(true)
const error = ref('')
const courseId = computed(() => String(route.params.courseId))
const lessonId = computed(() => String(route.params.lessonId))

const items = computed<LearnItem[]>(() => words.value.map(itemFromWord))

const startIndex = ref(0)

const lessonProgress = computed(() => calculateLessonProgress(words.value, wordProgressStore.progress))

const guidedStatuses = computed(() => guidedStepStatuses(
    words.value,
    wordProgressStore.progress.filter(item => item.courseId === courseId.value && item.lessonId === lessonId.value),
    key => evidenceStore.summaryFor(key),
))
const nextGuided = computed(() => nextGuidedStep(guidedStatuses.value))
const guidedComplete = computed(() => lessonComplete(guidedStatuses.value))
const currentGuided = computed(() => nextGuided.value ?? guidedStatuses.value.at(-1) ?? null)
const nextLesson = computed(() => {
    const index = courseLessons.value.findIndex(item => item.id === lessonId.value)
    return index >= 0 ? courseLessons.value[index + 1] ?? null : null
})

const stats = computed(() => ({
    studied: lessonProgress.value.studiedWords,
    total: lessonProgress.value.totalWords,
    mastered: lessonProgress.value.masteredWords,
}))

const meta = computed(() => [
    lesson.value?.cefrLevel,
    `${words.value.length} expressions`,
].filter((value): value is string => !!value))

const actions = computed(() => {
    const query = `courseId=${courseId.value}&lessonId=${lessonId.value}`

    const continueAction = nextGuided.value
        ? { key: nextGuided.value.id, label: nextGuided.value.id === 'practice' ? 'Continue to practice' : 'Continue to Meaning Recall', to: nextGuided.value.route(courseId.value, lessonId.value), primary: true }
        : nextLesson.value
            ? { key: 'next-lesson', label: 'Continue to the next lesson', to: `/courses/${courseId.value}/lessons/${nextLesson.value.id}`, primary: true }
            : { key: 'complete', label: 'Learning complete', to: '/learning-path', primary: true }

    return [
        continueAction,
        { key: 'practice', label: 'Review practice', to: `/practice?${query}` },
        { key: 'cloze', label: 'Fill in the blank', to: `/cloze?${query}` },
        { key: 'matching', label: 'Match pairs', to: `/matching?${query}` },
        { key: 'quiz', label: 'Quiz', to: `/quiz?${query}` },
    ]
})

/* Hard Words is the existing "save" for vocabulary — same store, same behaviour. */
function isSaved(item: LearnItem): boolean {
    return hardWordsStore.isHardWord(item.id)
}

function toggleSave(item: LearnItem) {
    hardWordsStore.toggleWord(item.id, item.meaning)
}

/* Keep the position in the URL (?w=3) so refresh and shared links resume — optional, additive. */
function syncPosition(index: number) {
    const { w: _previous, ...rest } = route.query

    if (lesson.value) {
        positionStore.record({
            courseId: courseId.value,
            lessonId: lessonId.value,
            title: lesson.value.title,
            index,
            total: words.value.length,
        })
    }

    void router.replace({ query: index > 0 ? { ...rest, w: String(index + 1) } : rest })
}

function onComplete() {
    /* Keep the bookmark at this lesson until the guided sequence moves to the
     * next lesson. Dashboard can therefore reopen the unfinished Practice or
     * Meaning Recall step after a refresh. */
}

onMounted(async () => {
    try {
        const manifest = await loadManifest()
        const course = manifest.courses.find(item => item.id === courseId.value)

        if (!course) throw new Error('Course not found')

        lesson.value = course.lessons.find(item => item.id === lessonId.value) ?? null
        courseLessons.value = course.lessons

        if (!lesson.value) throw new Error('Lesson not found')

        words.value = await loadLesson(lesson.value)
        startIndex.value = parseWordIndex(route.query.w, words.value.length)
        syncPosition(startIndex.value)
    } catch (e) {
        console.error(e)
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div>
        <div class="mx-auto max-w-6xl">
            <div v-if="loading" class="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-soft" role="status">
                Loading lesson…
            </div>

            <div v-else-if="error" class="rounded-3xl border border-bad-600/20 bg-bad-50 p-6" role="alert">
                <h2 class="font-semibold text-bad-600">Couldn't open this lesson</h2>
                <p class="mt-1 text-sm text-ink-soft">{{ error }}</p>
                <RouterLink :to="`/courses/${courseId}`" class="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-learn-700">← Back to the course</RouterLink>
            </div>

            <div v-else-if="lesson && !items.length" class="rounded-3xl border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-soft">
                No expressions found in this lesson.
            </div>

            <LearnStage
                v-else-if="lesson"
                :items="items"
                :title="lesson.title"
                :subtitle="lesson.subtitle"
                :meta="meta"
                :seed="`${courseId}/${lessonId}`"
                :back-to="`/courses/${courseId}`"
                back-label="Course"
                :initial-index="startIndex"
                :is-saved="isSaved"
                save-label="Hard Words"
                persian-audio
                :stats="stats"
                :book-images="lesson.images"
                :actions="actions"
                finish-label="Finish"
                @save="toggleSave"
                @update:index="syncPosition"
                @complete="onComplete"
                @view="onView"
            />

            <section v-if="lesson && items.length" class="mx-auto mt-5 max-w-6xl rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-5" aria-label="Guided lesson sequence">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.1em] text-accent-ink">Guided lesson</p>
                        <h2 class="mt-1 text-lg font-semibold text-ink">{{ currentGuided?.title }}</h2>
                        <p class="mt-1 text-sm text-ink-soft">{{ currentGuided?.objective }}</p>
                    </div>
                    <span class="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
                        {{ guidedStatuses.filter(step => step.completed || !step.eligible).length }} / {{ guidedStatuses.filter(step => step.eligible).length }} steps
                    </span>
                </div>
                <ol class="mt-4 grid gap-2 sm:grid-cols-3">
                    <li v-for="step in guidedStatuses" :key="step.id" class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" :class="step.completed ? 'border-good-600/30 bg-good-50 text-good-700' : step === currentGuided ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-line text-ink-soft'">
                        <AppIcon :name="step.completed ? 'check' : 'circle'" :size="15" />
                        <span class="min-w-0 truncate">{{ step.title }}</span>
                    </li>
                </ol>
                <p v-if="guidedComplete" class="mt-3 text-sm font-medium text-good-700">This lesson is complete. Continue to the next lesson when you are ready.</p>
            </section>
        </div>
    </div>
</template>
