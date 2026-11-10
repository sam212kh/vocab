<script setup lang="ts">
import { ref, watch } from 'vue'

import { useLearnerProfileStore } from '../stores/learnerProfile'
import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'
import type {
    ExplanationLanguage,
    LearningGoalType,
    StudyDay,
    StudyDurationMinutes,
} from '../types/learnerProfile'

const profileStore = useLearnerProfileStore()

const GOAL_LABELS: Record<LearningGoalType, string> = {
    speaking: 'Speaking',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    vocabulary: 'Vocabulary',
    grammar: 'Grammar',
    'professional-english': 'Professional English',
    'travel-english': 'Travel English',
    'exam-preparation': 'Exam preparation',
}

const GOAL_ORDER = Object.keys(GOAL_LABELS) as LearningGoalType[]

const DAY_LABELS: Record<StudyDay, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

const DAY_ORDER = Object.keys(DAY_LABELS) as StudyDay[]

const DURATIONS: StudyDurationMinutes[] = [15, 30, 45, 60]

function cloneFromProfile() {
    const source = profileStore.profile

    return {
        nativeLanguage: source.nativeLanguage,
        targetLanguage: source.targetLanguage,
        studyDurationMinutes: source.studyDurationMinutes,
        explanationLanguage: source.explanationLanguage,
        selfReportedLevel: source.selfReportedLevel,
        interestsText: source.interests.join(', '),
        selectedGoals: [...source.goals]
            .sort((a, b) => a.priority - b.priority)
            .map(goal => goal.type),
        selectedDays: [...source.studyDays],
    }
}

const form = ref(cloneFromProfile())

watch(
    () => profileStore.profile.updatedAt,
    () => {
        form.value = cloneFromProfile()
    }
)

function toggleGoal(goal: LearningGoalType) {
    const index = form.value.selectedGoals.indexOf(goal)

    if (index === -1) {
        form.value.selectedGoals.push(goal)
    } else {
        form.value.selectedGoals.splice(index, 1)
    }
}

function toggleDay(day: StudyDay) {
    const index = form.value.selectedDays.indexOf(day)

    if (index === -1) {
        form.value.selectedDays.push(day)
    } else {
        form.value.selectedDays.splice(index, 1)
    }
}

function submit() {
    profileStore.update({
        nativeLanguage: form.value.nativeLanguage.trim() || 'Persian',
        targetLanguage: form.value.targetLanguage.trim() || 'English',
        studyDurationMinutes: form.value.studyDurationMinutes,
        explanationLanguage: form.value.explanationLanguage as ExplanationLanguage,
        selfReportedLevel: form.value.selfReportedLevel as CefrLevel | null,
        interests: form.value.interestsText
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
        goals: form.value.selectedGoals.map((type, index) => ({
            type,
            priority: index + 1,
        })),
        studyDays: form.value.selectedDays,
    })
}

function reset() {
    profileStore.resetToDefaults()
}
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-8">
        <div>
            <h1 class="text-3xl font-bold text-gray-900">Profile</h1>
            <p class="mt-2 text-gray-500">
                These settings describe how you learn — nothing here is hardcoded into the
                learning logic, and everything is editable at any time.
            </p>
        </div>

        <form class="space-y-8" @submit.prevent="submit">
            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Languages</h2>

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <label class="block text-sm">
                        <span class="mb-1 block font-medium text-gray-700">Native language</span>
                        <input
                            v-model="form.nativeLanguage"
                            type="text"
                            class="w-full rounded-lg border px-3 py-2"
                        />
                    </label>

                    <label class="block text-sm">
                        <span class="mb-1 block font-medium text-gray-700">Target language</span>
                        <input
                            v-model="form.targetLanguage"
                            type="text"
                            class="w-full rounded-lg border px-3 py-2"
                        />
                    </label>
                </div>

                <label class="mt-4 block text-sm">
                    <span class="mb-1 block font-medium text-gray-700">Explanation language</span>
                    <select v-model="form.explanationLanguage" class="w-full rounded-lg border px-3 py-2">
                        <option value="bilingual">Bilingual (Persian + English)</option>
                        <option value="persian">Persian</option>
                        <option value="english">English only</option>
                    </select>
                </label>
            </section>

            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Learning goals</h2>
                <p class="mt-1 text-sm text-gray-500">Pick what matters most right now — order of selection sets priority.</p>

                <div class="mt-4 flex flex-wrap gap-2">
                    <button
                        v-for="goal in GOAL_ORDER"
                        :key="goal"
                        type="button"
                        class="rounded-full border px-3 py-1.5 text-sm transition"
                        :class="form.selectedGoals.includes(goal)
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                        @click="toggleGoal(goal)"
                    >
                        {{ GOAL_LABELS[goal] }}
                    </button>
                </div>
            </section>

            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Study schedule</h2>

                <label class="mt-4 block text-sm">
                    <span class="mb-1 block font-medium text-gray-700">Daily session length</span>
                    <select v-model.number="form.studyDurationMinutes" class="w-full rounded-lg border px-3 py-2 sm:w-48">
                        <option v-for="duration in DURATIONS" :key="duration" :value="duration">
                            {{ duration }} minutes
                        </option>
                    </select>
                </label>

                <div class="mt-4">
                    <span class="mb-2 block text-sm font-medium text-gray-700">Study days</span>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="day in DAY_ORDER"
                            :key="day"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-sm transition"
                            :class="form.selectedDays.includes(day)
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            @click="toggleDay(day)"
                        >
                            {{ DAY_LABELS[day] }}
                        </button>
                    </div>
                </div>
            </section>

            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Interests</h2>
                <p class="mt-1 text-sm text-gray-500">Comma-separated — used to steer example sentences and future content, not required.</p>

                <input
                    v-model="form.interestsText"
                    type="text"
                    placeholder="e.g. software engineering, travel, football"
                    class="mt-3 w-full rounded-lg border px-3 py-2"
                />
            </section>

            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Starting level (unverified)</h2>
                <p class="mt-1 text-sm text-gray-500">
                    A rough self-reported starting point only — not a certified or assessed level.
                    Used to seed the skill profile until a real assessment exists.
                </p>

                <div class="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        v-for="level in CEFR_LEVELS"
                        :key="level"
                        type="button"
                        class="rounded-full border px-3 py-1.5 text-sm transition"
                        :class="form.selfReportedLevel === level
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                        @click="form.selfReportedLevel = level"
                    >
                        {{ level }}
                    </button>
                    <button
                        type="button"
                        class="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                        @click="form.selfReportedLevel = null"
                    >
                        Not sure
                    </button>
                </div>
            </section>

            <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Learning program</h2>
                <p class="mt-1 text-sm text-gray-500">
                    No structured program selected — you're continuing self-paced, unlimited
                    learning on the core engine. Time-based programs (30/60/90-day, etc.) are
                    an optional layer planned for a later phase.
                </p>
            </section>

            <div class="flex items-center gap-3">
                <button
                    type="submit"
                    class="rounded-xl bg-black px-6 py-3 text-white hover:bg-gray-800"
                >
                    Save profile
                </button>
                <button
                    type="button"
                    class="rounded-xl border px-6 py-3 text-gray-600 hover:bg-gray-100"
                    @click="reset"
                >
                    Reset to defaults
                </button>
            </div>
        </form>
    </div>
</template>
