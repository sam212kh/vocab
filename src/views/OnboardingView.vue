<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '../components/ui/PageHeader.vue'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useSkillProfileStore } from '../stores/skillProfile'
import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'
import { DURATIONS, GOAL_LABELS, GOAL_ORDER } from '../services/learnerProfileLabels'
import type { LearningGoalType } from '../types/learnerProfile'

const router = useRouter()
const profileStore = useLearnerProfileStore()
const skillProfileStore = useSkillProfileStore()

const STEPS = ['welcome', 'goals', 'level', 'duration', 'placement'] as const
type Step = (typeof STEPS)[number]

const stepIndex = ref(0)
const step = computed<Step>(() => STEPS[stepIndex.value])

const LEVEL_OPTIONS: { level: CefrLevel | null; label: string; description: string }[] = [
    { level: 'A1', label: 'Complete beginner', description: "I know a few words, but can't really form sentences yet." },
    { level: 'A2', label: 'Some basic English', description: 'I can say simple things about myself and everyday life.' },
    { level: 'B1', label: 'Simple conversations', description: 'I can follow and join simple conversations.' },
    { level: 'B2', label: 'Communicate, with mistakes', description: 'I can get my point across but still make noticeable mistakes.' },
    { level: 'C1', label: 'Comfortable communication', description: 'I can communicate comfortably in most situations.' },
    { level: null, label: "I'm not sure", description: "We'll figure it out together — you can take the placement test next." },
]

const selectedGoals = ref<LearningGoalType[]>([...profileStore.profile.goals].sort((a, b) => a.priority - b.priority).map(goal => goal.type))
const selectedLevel = ref<CefrLevel | null>(profileStore.profile.selfReportedLevel)
const selectedDuration = ref(profileStore.profile.studyDurationMinutes)

function toggleGoal(goal: LearningGoalType) {
    const index = selectedGoals.value.indexOf(goal)
    if (index === -1) selectedGoals.value.push(goal)
    else selectedGoals.value.splice(index, 1)
}

function next() {
    if (step.value === 'goals') {
        profileStore.update({ goals: selectedGoals.value.map((type, index) => ({ type, priority: index + 1 })) }, { silent: true })
    }

    if (step.value === 'level') {
        profileStore.update({ selfReportedLevel: selectedLevel.value }, { silent: true })
        if (selectedLevel.value) skillProfileStore.selfReportLevel('vocabulary', selectedLevel.value, { silent: true })
    }

    if (step.value === 'duration') {
        profileStore.update({ studyDurationMinutes: selectedDuration.value }, { silent: true })
    }

    if (stepIndex.value < STEPS.length - 1) stepIndex.value += 1
}

function back() {
    if (stepIndex.value > 0) stepIndex.value -= 1
}

function completeOnboarding() {
    profileStore.update({ onboardingCompletedAt: Date.now() }, { silent: true })
}

function goToPlacement() {
    completeOnboarding()
    router.push('/placement')
}

function skipPlacement() {
    completeOnboarding()
    router.push('/')
}
</script>

<template>
    <div class="mx-auto max-w-xl">
        <PageHeader eyebrow="Welcome" title="Let's set up English Upgrade for you" />

        <div class="mt-3 flex gap-1.5" role="progressbar" :aria-valuenow="stepIndex + 1" :aria-valuemin="1" :aria-valuemax="STEPS.length">
            <span
                v-for="(s, index) in STEPS"
                :key="s"
                class="h-1.5 flex-1 rounded-full"
                :class="index <= stepIndex ? 'bg-accent' : 'bg-gray-200'"
            />
        </div>

        <div class="surface mt-6 space-y-5 p-6">
            <section v-if="step === 'welcome'" class="space-y-4 text-center">
                <h2 class="text-xl font-semibold text-gray-900">Here's what you can learn</h2>
                <p class="text-sm text-gray-600">
                    Everyday English, vocabulary, grammar, listening, speaking, writing,
                    real-life conversations, and professional English — all in one place.
                </p>
                <button type="button" class="btn-primary btn-lg w-full" @click="next">Get started</button>
            </section>

            <section v-else-if="step === 'goals'" class="space-y-4">
                <h2 class="text-xl font-semibold text-gray-900">What do you want to achieve?</h2>
                <p class="text-sm text-gray-500">Pick as many as you like.</p>
                <div class="flex flex-wrap gap-2">
                    <button
                        v-for="goal in GOAL_ORDER"
                        :key="goal"
                        type="button"
                        class="chip"
                        :aria-pressed="selectedGoals.includes(goal)"
                        @click="toggleGoal(goal)"
                    >
                        {{ GOAL_LABELS[goal] }}
                    </button>
                </div>
            </section>

            <section v-else-if="step === 'level'" class="space-y-4">
                <h2 class="text-xl font-semibold text-gray-900">How would you describe your English now?</h2>
                <p class="text-sm text-gray-500">This is just your own guess for now — not an official result.</p>
                <div class="space-y-2">
                    <button
                        v-for="option in LEVEL_OPTIONS"
                        :key="option.label"
                        type="button"
                        class="choice w-full"
                        :class="selectedLevel === option.level ? 'choice-selected' : ''"
                        @click="selectedLevel = option.level"
                    >
                        <span class="flex flex-col items-start">
                            <span class="font-semibold">{{ option.label }}</span>
                            <span class="text-sm" :class="selectedLevel === option.level ? 'text-white/80' : 'text-gray-500'">{{ option.description }}</span>
                        </span>
                    </button>
                </div>
            </section>

            <section v-else-if="step === 'duration'" class="space-y-4">
                <h2 class="text-xl font-semibold text-gray-900">How much time can you realistically give each day?</h2>
                <p class="text-sm text-gray-500">You can always change this later — pick something you can actually keep up.</p>
                <div class="flex flex-wrap gap-2">
                    <button
                        v-for="duration in DURATIONS"
                        :key="duration"
                        type="button"
                        class="chip"
                        :aria-pressed="selectedDuration === duration"
                        @click="selectedDuration = duration"
                    >
                        {{ duration }} min
                    </button>
                </div>
            </section>

            <section v-else-if="step === 'placement'" class="space-y-4 text-center">
                <h2 class="text-xl font-semibold text-gray-900">Want a quick placement test?</h2>
                <p class="text-sm text-gray-600">
                    A short adaptive test (about 10-15 minutes) for vocabulary and grammar —
                    helps us start you in the right place. You can also skip it and start from
                    the beginning, or take it later from your profile.
                </p>
                <button type="button" class="btn-primary btn-lg w-full" @click="goToPlacement">Take the placement test</button>
                <button type="button" class="btn-ghost w-full" @click="skipPlacement">Skip and start learning</button>
            </section>

            <div v-if="step !== 'welcome' && step !== 'placement'" class="flex items-center justify-between pt-2">
                <button type="button" class="btn-ghost" @click="back">Back</button>
                <button type="button" class="btn-primary" @click="next">Continue</button>
            </div>
        </div>
    </div>
</template>
