<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadManifest } from '../services/vocabulary'
import { loadLesson } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { guidedStepStatuses, lessonComplete } from '../services/guidedLearning'
import AppIcon from '../components/ui/AppIcon.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StateBlock from '../components/ui/StateBlock.vue'
import type { CourseManifest } from '../types/vocabulary';

const route = useRoute()

const course = ref<CourseManifest | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
    try {
        const manifest = await loadManifest()
        const courseId = String(route.params.courseId)
      course.value = manifest.courses.find(
          item => item.id === courseId
      ) ?? null

      if( !course.value ) {
          error.value = 'Course not found'
      } else {
          const entries = await Promise.all(course.value.lessons.map(async lesson => {
              try {
                  return [lesson.id, await loadLesson(lesson)] as const
              } catch {
                  return [lesson.id, []] as const
              }
          }))
          lessonWords.value = Object.fromEntries(entries)
      }

    } catch (e) {
        error.value = 'Failed to load course'
        console.error(e)
    } finally {
      loading.value = false
    }
})

const wordProgressStore = useWordProgressStore()
const evidenceStore = useLearningEvidenceStore()
const filter = ref('')
const lessonWords = ref<Record<string, import('../types/vocabulary').Word[]>>({})

/* Words practised per lesson in this course (existing progress store). */
const practicedByLesson = computed(() => {
    const counts = new Map<string, number>()

    for (const item of wordProgressStore.progress) {
        if (item.courseId === String(route.params.courseId)) {
            counts.set(item.lessonId, (counts.get(item.lessonId) ?? 0) + 1)
        }
    }

    return counts
})

const visibleLessons = computed(() => {
    const query = filter.value.trim().toLowerCase()
    const lessons = course.value?.lessons ?? []

    if (!query) return lessons.map((lesson, index) => ({ lesson, number: index + 1 }))

    return lessons
        .map((lesson, index) => ({ lesson, number: index + 1 }))
        .filter(({ lesson }) => `${lesson.title} ${lesson.subtitle ?? ''}`.toLowerCase().includes(query))
})

const lessonCompletion = computed(() => new Map(
    (course.value?.lessons ?? []).map(lesson => {
        const words = lessonWords.value[lesson.id] ?? []
        const statuses = guidedStepStatuses(words, wordProgressStore.progress.filter(item => item.courseId === course.value?.id && item.lessonId === lesson.id), key => evidenceStore.summaryFor(key))
        return [lesson.id, words.length > 0 && lessonComplete(statuses)] as const
    }),
))

const firstIncompleteIndex = computed(() => {
    const lessons = course.value?.lessons ?? []
    const index = lessons.findIndex(lesson => lessonWords.value[lesson.id]?.length && !lessonCompletion.value.get(lesson.id))
    return index < 0 ? lessons.length : index
})

function isUnlocked(index: number): boolean {
    return index <= firstIncompleteIndex.value
}

function lessonProgress(lessonId: string): string {
    const words = lessonWords.value[lessonId]
    if (!words?.length) return ''
    return lessonCompletion.value.get(lessonId) ? 'completed' : 'in progress'
}
</script>
<template>
    <div class="mx-auto max-w-3xl space-y-6">
        <StateBlock v-if="loading" kind="loading" title="Loading course" :rows="4" />
        <StateBlock v-else-if="error" kind="error" :text="error" />

        <template v-else-if="course">
            <div>
                <RouterLink to="/lessons" class="btn-ghost -ml-3 mb-1"><AppIcon name="arrow-left" :size="16" /> All courses</RouterLink>
                <PageHeader eyebrow="Course" :title="course.title" serif :description="course.description" />
            </div>

            <div v-if="course.lessons.length > 12" class="relative">
                <input v-model="filter" type="search" class="field pl-4" placeholder="Filter lessons…" aria-label="Filter lessons" />
            </div>

            <StateBlock v-if="!visibleLessons.length" kind="empty" title="No lessons match" text="Try a different search." />

            <ol v-else class="surface divide-y divide-gray-100 overflow-hidden">
                <li v-for="{ lesson, number } in visibleLessons" :key="lesson.id">
                    <RouterLink
                        v-if="isUnlocked(number - 1)"
                        :to="`/courses/${course.id}/lessons/${lesson.id}`"
                        class="group flex min-h-16 items-center gap-4 px-4 py-3 transition hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none sm:px-5"
                    >
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums" :class="lessonCompletion.get(lesson.id) ? 'bg-green-100 text-green-700' : 'bg-accent-soft text-accent-ink'">
                            <AppIcon v-if="lessonCompletion.get(lesson.id)" name="check" :size="15" />
                            <template v-else>{{ number }}</template>
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="wrap-anywhere block font-semibold text-gray-900">{{ lesson.title }}</span>
                            <span v-if="lesson.subtitle" class="block truncate text-sm text-gray-500">{{ lesson.subtitle }}</span>
                        </span>
                        <span v-if="lessonProgress(lesson.id)" class="hidden shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 sm:inline-flex">{{ lessonProgress(lesson.id) }}</span>
                        <AppIcon name="chevron-right" :size="18" class="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                    </RouterLink>
                    <div v-else class="flex min-h-16 items-center gap-4 px-4 py-3 opacity-60 sm:px-5" aria-disabled="true">
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-400"><AppIcon name="lock" :size="14" /></span>
                        <span class="min-w-0 flex-1">
                            <span class="wrap-anywhere block font-semibold text-gray-500">{{ lesson.title }}</span>
                            <span class="block text-sm text-gray-400">Complete the previous lesson to unlock this one.</span>
                        </span>
                    </div>
                </li>
            </ol>
        </template>
    </div>
</template>
