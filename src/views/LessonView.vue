<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import LearnStage from '../components/learn/LearnStage.vue'

import { loadLesson, loadManifest } from '../services/vocabulary'
import { calculateLessonProgress } from '../services/lessonProgress'
import { itemFromWord, parseWordIndex } from '../services/learnItems'
import type { LearnItem } from '../services/learnItems'

import { useHardWordsStore } from '../stores/hardWords'
import { useLearningPositionStore } from '../stores/learningPosition'
import { useWordProgressStore } from '../stores/wordProgress'

import type { LessonManifest, Word } from '../types/vocabulary'

const route = useRoute()
const router = useRouter()

const hardWordsStore = useHardWordsStore()
const wordProgressStore = useWordProgressStore()
const positionStore = useLearningPositionStore()

const lesson = ref<LessonManifest | null>(null)
const words = ref<Word[]>([])
const loading = ref(true)
const error = ref('')

const items = computed<LearnItem[]>(() => words.value.map(itemFromWord))

const startIndex = ref(0)

const lessonProgress = computed(() => calculateLessonProgress(words.value, wordProgressStore.progress))

const stats = computed(() => ({
    studied: lessonProgress.value.studiedWords,
    total: lessonProgress.value.totalWords,
    mastered: lessonProgress.value.masteredWords,
}))

const meta = computed(() => [
    lesson.value?.cefrLevel,
    `${words.value.length} expressions`,
].filter((value): value is string => !!value))

const courseId = computed(() => String(route.params.courseId))
const lessonId = computed(() => String(route.params.lessonId))

const actions = computed(() => {
    const query = `courseId=${courseId.value}&lessonId=${lessonId.value}`

    return [
        { key: 'practice', label: 'Start practice', to: `/practice?${query}`, primary: true },
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
    positionStore.clearIfLesson(courseId.value, lessonId.value)
}

onMounted(async () => {
    try {
        const manifest = await loadManifest()
        const course = manifest.courses.find(item => item.id === courseId.value)

        if (!course) throw new Error('Course not found')

        lesson.value = course.lessons.find(item => item.id === lessonId.value) ?? null

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
            />
        </div>
    </div>
</template>
