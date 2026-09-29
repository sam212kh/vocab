<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useWordProgressStore } from '../stores/wordProgress'

const wordProgressStore =
    useWordProgressStore()

const progress = computed(() => {
    return wordProgressStore.progress
})

const totalWords = computed(() => {
    return progress.value.length
})

const newWords = computed(() => {
    return progress.value.filter(
        item => item.status === 'new'
    ).length
})

const learningWords = computed(() => {
    return progress.value.filter(
        item => item.status === 'learning'
    ).length
})

const reviewingWords = computed(() => {
    return progress.value.filter(
        item => item.status === 'reviewing'
    ).length
})

const masteredWords = computed(() => {
    return progress.value.filter(
        item => item.status === 'mastered'
    ).length
})

const dueWords = computed(() => {
    return wordProgressStore.getDueWords().length
})

const totalCorrect = computed(() => {
    return progress.value.reduce(
        (total, item) =>
            total + item.correctAnswers,
        0
    )
})

const totalWrong = computed(() => {
    return progress.value.reduce(
        (total, item) =>
            total + item.wrongAnswers,
        0
    )
})

const totalAnswers = computed(() => {
    return (
        totalCorrect.value +
        totalWrong.value
    )
})

const accuracy = computed(() => {
    if (!totalAnswers.value) {
        return 0
    }

    return Math.round(
        (totalCorrect.value /
            totalAnswers.value) *
        100
    )
})

const mastery = computed(() => {
    if (!totalWords.value) {
        return 0
    }

    return Math.round(
        (masteredWords.value /
            totalWords.value) *
        100
    )
})

const currentStreak = computed(() => {
    const reviewedDays =
        new Set<string>()

    for (const item of progress.value) {
        if (
            !item.lastReviewedAt
        ) {
            continue
        }

        const date =
            new Date(
                item.lastReviewedAt
            )

        const key =
            getDateKey(date)

        reviewedDays.add(key)
    }

    if (!reviewedDays.size) {
        return 0
    }

    let streak = 0

    const today =
        startOfDay(new Date())

    for (;;) {
        const date =
            new Date(today)

        date.setDate(
            date.getDate() - streak
        )

        const key =
            getDateKey(date)

        if (
            !reviewedDays.has(key)
        ) {
            break
        }

        streak++
    }

    return streak
})

const statusItems = computed(() => {
    return [
        {
            label: 'New',
            value: newWords.value,
            percentage:
                percentage(
                    newWords.value,
                    totalWords.value
                ),
        },
        {
            label: 'Learning',
            value:
            learningWords.value,
            percentage:
                percentage(
                    learningWords.value,
                    totalWords.value
                ),
        },
        {
            label: 'Reviewing',
            value:
            reviewingWords.value,
            percentage:
                percentage(
                    reviewingWords.value,
                    totalWords.value
                ),
        },
        {
            label: 'Mastered',
            value:
            masteredWords.value,
            percentage:
                percentage(
                    masteredWords.value,
                    totalWords.value
                ),
        },
    ]
})

function percentage(
    value: number,
    total: number
): number {
    if (!total) {
        return 0
    }

    return Math.round(
        (value / total) * 100
    )
}

function startOfDay(
    date: Date
): Date {
    const result =
        new Date(date)

    result.setHours(
        0,
        0,
        0,
        0
    )

    return result
}

function getDateKey(
    date: Date
): string {
    const year =
        date.getFullYear()

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, '0')

    const day =
        String(
            date.getDate()
        ).padStart(2, '0')

    return `${year}-${month}-${day}`
}
</script>

<template>
    <div class="mx-auto max-w-7xl space-y-8">
        <!-- Header -->

        <div>
            <h1
                class="text-3xl font-bold text-gray-900"
            >
                Dashboard
            </h1>

            <p
                class="mt-2 text-gray-500"
            >
                Track your vocabulary progress
                and review what needs attention.
            </p>
        </div>

        <!-- Review Alert -->

        <div
            v-if="dueWords > 0"
            class="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
            <div>
                <h2
                    class="text-lg font-semibold text-gray-900"
                >
                    {{ dueWords }} words
                    are ready for review
                </h2>

                <p
                    class="mt-1 text-sm text-gray-500"
                >
                    Review them now to
                    strengthen your memory.
                </p>
            </div>

            <RouterLink
                to="/review"
                class="inline-flex items-center justify-center rounded-xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
            >
                Start Review
            </RouterLink>
        </div>

        <div
            v-else
            class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
            <h2
                class="text-lg font-semibold text-gray-900"
            >
                You're all caught up
            </h2>

            <p
                class="mt-1 text-sm text-gray-500"
            >
                There are no words waiting
                for review right now.
            </p>
        </div>

        <!-- Main Stats -->

        <div
            class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
            <!-- Total -->

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Studied Words
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ totalWords }}
                </p>
            </div>

            <!-- Due -->

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Due Today
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ dueWords }}
                </p>
            </div>

            <!-- Streak -->

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Learning Streak
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ currentStreak }}
                </p>

                <p
                    class="mt-1 text-xs text-gray-400"
                >
                    {{
                        currentStreak === 1
                            ? 'day'
                            : 'days'
                    }}
                </p>
            </div>

            <!-- Mastery -->

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Mastery
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ mastery }}%
                </p>

                <p
                    class="mt-1 text-xs text-gray-400"
                >
                    {{ masteredWords }}
                    mastered
                </p>
            </div>
        </div>

        <!-- Accuracy -->

        <div
            class="grid gap-4 lg:grid-cols-3"
        >
            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Accuracy
                </p>

                <div
                    class="mt-3 flex items-end gap-2"
                >
                    <span
                        class="text-4xl font-bold text-gray-900"
                    >
                        {{ accuracy }}%
                    </span>

                    <span
                        class="pb-1 text-sm text-gray-400"
                    >
                        {{ totalAnswers }}
                        answers
                    </span>
                </div>
            </div>

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Correct Answers
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ totalCorrect }}
                </p>
            </div>

            <div
                class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
                <p
                    class="text-sm text-gray-500"
                >
                    Wrong Answers
                </p>

                <p
                    class="mt-2 text-3xl font-bold text-gray-900"
                >
                    {{ totalWrong }}
                </p>
            </div>
        </div>

        <!-- Status -->

        <div
            class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
            <div
                class="flex items-center justify-between"
            >
                <div>
                    <h2
                        class="text-lg font-semibold text-gray-900"
                    >
                        Vocabulary Progress
                    </h2>

                    <p
                        class="mt-1 text-sm text-gray-500"
                    >
                        Current status of studied
                        words.
                    </p>
                </div>

                <span
                    class="text-sm text-gray-400"
                >
                    {{ totalWords }} words
                </span>
            </div>

            <div
                class="mt-6 space-y-5"
            >
                <div
                    v-for="item in statusItems"
                    :key="item.label"
                >
                    <div
                        class="mb-2 flex items-center justify-between text-sm"
                    >
                        <span
                            class="font-medium text-gray-700"
                        >
                            {{ item.label }}
                        </span>

                        <span
                            class="text-gray-400"
                        >
                            {{ item.value }}
                            ·
                            {{ item.percentage }}%
                        </span>
                    </div>

                    <div
                        class="h-2 overflow-hidden rounded-full bg-gray-100"
                    >
                        <div
                            class="h-full rounded-full bg-gray-900 transition-all"
                            :style="{
                                width:
                                    `${item.percentage}%`,
                            }"
                        />
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->

        <div>
            <h2
                class="text-lg font-semibold text-gray-900"
            >
                Quick Actions
            </h2>

            <div
                class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
                <RouterLink
                    to="/lessons"
                    class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <p
                        class="font-semibold text-gray-900"
                    >
                        Lessons
                    </p>

                    <p
                        class="mt-1 text-sm text-gray-500"
                    >
                        Learn new vocabulary
                    </p>
                </RouterLink>

                <RouterLink
                    to="/review"
                    class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <p
                        class="font-semibold text-gray-900"
                    >
                        Review
                    </p>

                    <p
                        class="mt-1 text-sm text-gray-500"
                    >
                        Practice due words
                    </p>
                </RouterLink>

                <RouterLink
                    to="/hard-words"
                    class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <p
                        class="font-semibold text-gray-900"
                    >
                        Hard Words
                    </p>

                    <p
                        class="mt-1 text-sm text-gray-500"
                    >
                        Practice difficult words
                    </p>
                </RouterLink>

                <RouterLink
                    to="/speaking-practice"
                    class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <p
                        class="font-semibold text-gray-900"
                    >
                        Speaking
                    </p>

                    <p
                        class="mt-1 text-sm text-gray-500"
                    >
                        Practice pronunciation
                    </p>
                </RouterLink>
            </div>
        </div>
    </div>
</template>