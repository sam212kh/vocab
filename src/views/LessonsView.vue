<script setup lang="ts">
import { onMounted, ref } from "vue"
import { loadManifest } from "../services/vocabulary"
import type { CourseManifest} from "../types/vocabulary"

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
</script>

<template>
    <div>
        <h1 class="mb-6 text-3xl font-bold">
            Courses
        </h1>

        <div v-if="loading">
            Loading...
        </div>

        <div v-else-if="error">
            {{ error }}
        </div>

        <div
            v-else
            class="grid grid-cols-1 gap-6 md:grid-cols-2"
        >
            <RouterLink
                v-for="course in courses"
                :key="course.id"
                :to="`/courses/${course.id}`"
                class="block rounded-xl border bg-white p-6 shadow-sm"
            >
                <h2 class="text-xl font-semibold">
                    {{ course.title }}
                </h2>

                <p class="mt-2 text-gray-600">
                    {{ course.description }}
                </p>

                <p class="mt-4 text-sm text-gray-500">
                    {{ course.lessons.length }} learning units
                </p>
            </RouterLink>
        </div>
    </div>
</template>