<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { loadManifest } from '../services/vocabulary'
import type { CourseManifest } from '../types/vocabulary'

const courses = ref<CourseManifest[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <section class="mx-auto max-w-6xl">
        <div class="mb-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Learn
            </p>
            <h1 class="mt-1 text-3xl font-bold">Choose what you want to learn</h1>
            <p class="mt-2 text-gray-500">
                Lesson files are loaded only after you open a learning unit.
            </p>
        </div>

        <div v-if="loading" class="rounded-2xl border bg-white p-8 text-center">
            Loading courses...
        </div>

        <div v-else-if="error" class="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            {{ error }}
        </div>

        <div v-else class="grid gap-6 md:grid-cols-2">
            <article
                v-for="course in courses"
                :key="course.id"
                class="rounded-2xl border bg-white p-6 shadow-sm"
            >
                <h2 class="text-xl font-bold">{{ course.title }}</h2>
                <p class="mt-2 text-gray-600">{{ course.description }}</p>

                <div class="mt-5 flex items-center justify-between">
                    <span class="text-sm text-gray-500">
                        {{ course.lessons.length }} learning units
                    </span>
                    <RouterLink
                        :to="`/courses/${course.id}`"
                        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                    >
                        Open course
                    </RouterLink>
                </div>
            </article>
        </div>
    </section>
</template>
