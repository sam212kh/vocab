<script setup lang="ts">
import LearningIllustration from '../components/art/LearningIllustration.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StateBlock from '../components/ui/StateBlock.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import { useWordProgressStore } from '../stores/wordProgress'
import { computed, onMounted, ref } from "vue"
import { loadManifest } from "../services/vocabulary"
import type { CourseManifest} from "../types/vocabulary.ts"

const courses = ref<CourseManifest[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
    try {
      const manifest = await loadManifest()
      courses.value = manifest.courses
    } catch (err) {
        error.value = 'Failed to load courses'
        console.error(err)
    } finally {
      loading.value = false
    }
})

const wordProgressStore = useWordProgressStore()

/* Words the learner has practised, per course (from the existing progress store). */
const practicedByCourse = computed(() => {
    const counts = new Map<string, number>()

    for (const item of wordProgressStore.progress) {
        counts.set(item.courseId, (counts.get(item.courseId) ?? 0) + 1)
    }

    return counts
})
</script>

<template>
    <div class="mx-auto max-w-6xl space-y-6">
        <PageHeader eyebrow="Learn" title="Courses" serif description="Pick a course, then open a lesson. Learn at your own pace, then practise." />

        <StateBlock v-if="loading" kind="loading" title="Loading courses" :rows="3" />
        <StateBlock v-else-if="error" kind="error" :text="error" />

        <div v-else class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <RouterLink
                v-for="course in courses"
                :key="course.id"
                :to="`/courses/${course.id}`"
                class="surface group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
            >
                <div class="aspect-[16/9] overflow-hidden" aria-hidden="true">
                    <LearningIllustration :seed="course.id" />
                </div>
                <div class="flex flex-1 flex-col p-5">
                    <h2 class="font-display text-xl font-semibold leading-snug text-gray-900 group-hover:text-accent-ink">{{ course.title }}</h2>
                    <p v-if="course.description" class="mt-1.5 line-clamp-2 text-sm text-gray-500">{{ course.description }}</p>
                    <div class="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-gray-400">
                        <span>{{ course.lessons.length }} units</span>
                        <span v-if="practicedByCourse.get(course.id)" class="inline-flex items-center gap-1 text-accent-ink">
                            <AppIcon name="check" :size="13" /> {{ practicedByCourse.get(course.id) }} words practised
                        </span>
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>
