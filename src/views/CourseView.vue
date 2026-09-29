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
    <div v-if="loading">
        Loading
    </div>
    <div v-else-if="error">
      {{ error }}
    </div>
    <template v-else-if="course">
        <h1 class="text-3xl font-blod m-5">
            {{ course.title }}
        </h1>
        <p class="mt-2 text-gry-600">
            {{ course.description }}
        </p>

        <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <RouterLink
                v-for="lesson in course.lessons"
                :key="lesson.id"
                :to="`/courses/${course.id}/lessons/${lesson.id}`"
                class="block rounded-xl border bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
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
            </RouterLink>

        </div>
    </template>


</template>