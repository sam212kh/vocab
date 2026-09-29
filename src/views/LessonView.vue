<script setup lang="ts">
import {
    computed,
    onMounted,
    ref,
} from 'vue'

import { useRoute } from 'vue-router'

import {
    loadManifest,
    loadLesson,
} from '../services/vocabulary'

import type {
    LessonManifest,
    Word,
} from '../types/vocabulary'

import WordCard from '../components/vocabulary/WordCard.vue'

import {
    useWordProgressStore,
} from '../stores/wordProgress'

import {
    calculateLessonProgress,
} from '../services/lessonProgress'

const route = useRoute()

const lesson =
    ref<LessonManifest | null>(null)

const words =
    ref<Word[]>([])

const loading =
    ref(true)

const error =
    ref('')

const wordProgressStore =
    useWordProgressStore()

const lessonProgress = computed(() => {
    return calculateLessonProgress(
        words.value,
        wordProgressStore.progress
    )
})

onMounted(async () => {
    try {
        const manifest =
            await loadManifest()

        const courseId =
            String(route.params.courseId)

        const lessonId =
            String(route.params.lessonId)

        const course =
            manifest.courses.find(
                item =>
                    item.id === courseId
            )

        if (!course) {
            throw new Error(
                'Course not found'
            )
        }

        lesson.value =
            course.lessons.find(
                item =>
                    item.id === lessonId
            ) ?? null

        if (!lesson.value) {
            throw new Error(
                'Lesson not found'
            )
        }

        words.value =
            await loadLesson(
                lesson.value
            )

        console.log(
            'Loaded lesson:',
            lesson.value
        )

        console.log(
            'Loaded words:',
            words.value
        )
    } catch (e) {
        console.error(e)

        error.value =
            e instanceof Error
                ? e.message
                : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div
        class="mx-auto max-w-5xl space-y-6"
    >
        <!-- Loading -->

        <div
            v-if="loading"
            class="rounded-2xl border bg-white p-8 text-center"
        >
            <p
                class="text-gray-500"
            >
                Loading lesson...
            </p>
        </div>

        <!-- Error -->

        <div
            v-else-if="error"
            class="rounded-2xl border border-red-200 bg-red-50 p-6"
        >
            <h2
                class="font-semibold text-red-800"
            >
                Failed to load lesson
            </h2>

            <p
                class="mt-2 text-sm text-red-600"
            >
                {{ error }}
            </p>
        </div>

        <!-- Lesson -->

        <template v-else-if="lesson">
            <!-- Header -->

            <div>
                <h1
                    class="text-3xl font-bold text-gray-900"
                >
                    {{ lesson.title }}
                </h1>

                <p
                    v-if="lesson.subtitle"
                    class="mt-2 text-gray-500"
                >
                    {{ lesson.subtitle }}
                </p>
            </div>

            <!-- Progress -->

            <div
                v-if="words.length"
                class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
                <div
                    class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div>
                        <p
                            class="text-sm font-medium text-gray-700"
                        >
                            Lesson Progress
                        </p>

                        <p
                            class="mt-1 text-sm text-gray-500"
                        >
                            {{
                                lessonProgress.studiedWords
                            }}
                            /
                            {{
                                lessonProgress.totalWords
                            }}
                            words studied
                        </p>
                    </div>

                    <div
                        class="text-left sm:text-right"
                    >
                        <p
                            class="text-2xl font-bold text-gray-900"
                        >
                            {{
                                lessonProgress.completionPercent
                            }}%
                        </p>

                        <p
                            class="text-xs text-gray-400"
                        >
                            {{
                                lessonProgress.masteredWords
                            }}
                            mastered
                        </p>
                    </div>
                </div>

                <div
                    class="mt-4 h-2 overflow-hidden rounded-full bg-gray-100"
                >
                    <div
                        class="h-full rounded-full bg-gray-900 transition-all duration-500"
                        :style="{
                            width:
                                `${lessonProgress.completionPercent}%`,
                        }"
                    />
                </div>
            </div>

            <!-- Empty -->

            <div
                v-if="!words.length"
                class="rounded-2xl border bg-white p-8 text-center"
            >
                <p
                    class="text-gray-500"
                >
                    No words found in this
                    lesson.
                </p>
            </div>

            <!-- Words -->

            <div
                v-else
                class="space-y-6"
            >
                <WordCard
                    v-for="(
                        word,
                        index
                    ) in words"
                    :key="word.word"
                    :word="word"
                    :index="index"
                />
            </div>
        </template>
    </div>
</template>