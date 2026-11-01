<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadManifest } from '../services/vocabulary'
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
      }

    } catch (e) {
        error.value = 'Failed to load course'
        console.log(e)
    } finally {
      loading.value = false
    }
})
</script>
<template>
    <div class="mx-auto max-w-6xl space-y-6">
    <div
        v-if="loading"
        class="rounded-2xl border bg-white p-8 text-center"
    >
        <p class="text-gray-500">Loading course...</p>
    </div>
    <div
        v-else-if="error"
        class="rounded-2xl border border-red-200 bg-red-50 p-6"
    >
        <p class="text-sm text-red-600">{{ error }}</p>
    </div>
    <template v-else-if="course">
        <div>
        <h1 class="text-3xl font-bold text-gray-900">
            {{ course.title }}
        </h1>
        <p class="mt-2 text-gray-500">
            {{ course.description }}
        </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <RouterLink
                v-for="lesson in course.lessons"
                :key="lesson.id"
                :to="`/courses/${course.id}/lessons/${lesson.id}`"
                class="block overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
                <img
                    v-if="lesson.images && lesson.images.length"
                    :src="lesson.images[0]"
                    :alt="lesson.title"
                    class="h-32 w-full object-cover object-top"
                    loading="lazy"
                />

                <div class="p-5">
                <h2 class="font-semibold">
                    {{ lesson.title }}
                </h2>
                <p
                    v-if="lesson.subtitle"
                    class="mt-2 text-sm text-gray-500"
                >
                    {{ lesson.subtitle }}
                </p>

                <p class="mt-4 text-sm text-gray-500">
                    {{ lesson.type }}
                </p>
                </div>
            </RouterLink>

        </div>
    </template>
    </div>
</template>