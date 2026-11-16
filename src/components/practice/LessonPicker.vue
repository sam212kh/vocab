<script setup lang="ts">
import { computed } from 'vue'

import type { CourseManifest } from '../../types/vocabulary'

/** The course → lesson chooser every exercise starts from. Hidden once a session is running. */
const props = defineProps<{
    courses: CourseManifest[]
    courseId: string
    lessonId: string
    loading?: boolean
    startLabel?: string
}>()

const emit = defineEmits<{
    'update:courseId': [value: string]
    'update:lessonId': [value: string]
    start: []
}>()

const lessons = computed(() => props.courses.find(course => course.id === props.courseId)?.lessons ?? [])

function chooseCourse(event: Event) {
    emit('update:courseId', (event.target as HTMLSelectElement).value)
    emit('update:lessonId', '')
}
</script>

<template>
    <form class="surface space-y-4 p-5 sm:p-6" @submit.prevent="emit('start')">
        <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
                <span class="label mb-1.5 block">Course</span>
                <select :value="courseId" class="field" @change="chooseCourse">
                    <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.title }}</option>
                </select>
            </label>

            <label class="block">
                <span class="label mb-1.5 block">Lesson</span>
                <select :value="lessonId" class="field" @change="emit('update:lessonId', ($event.target as HTMLSelectElement).value)">
                    <option value="">Select a lesson</option>
                    <option v-for="lesson in lessons" :key="lesson.id" :value="lesson.id">{{ lesson.title }}</option>
                </select>
            </label>
        </div>

        <button type="submit" class="btn-primary btn-lg w-full" :disabled="loading || !lessonId">
            {{ loading ? 'Loading…' : (startLabel ?? 'Start') }}
        </button>
    </form>
</template>
