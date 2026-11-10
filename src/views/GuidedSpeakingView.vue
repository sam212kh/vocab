<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { loadSpeakingManifest } from '../services/speakingContent'
import { checkPronunciation } from '../services/pronunciation'
import { useSpeakingPractice } from '../composables/useSpeakingPractice'
import { usePerformanceStore } from '../stores/performance'

import SpeechButton from '../components/ui/SpeechButton.vue'

import type { SpeakingStep, SpeakingTopic } from '../types/speaking'

const performanceStore = usePerformanceStore()

const topics = ref<SpeakingTopic[]>([])
const loading = ref(false)
const error = ref('')

const activeTopic = ref<SpeakingTopic | null>(null)
const stepIndex = ref(0)

interface StepRecord {
    step: SpeakingStep
    transcript: string
    /** Only set for repeat steps (transcript match score, not phoneme-level). */
    score: number | null
}

const records = ref<StepRecord[]>([])
const finished = ref(false)

const {
    isSupported,
    isListening,
    transcript,
    error: speechError,
    startListening,
    reset,
} = useSpeakingPractice()

const currentStep = computed(() => activeTopic.value?.steps[stepIndex.value] ?? null)

const currentRecord = computed(() =>
    records.value.length > stepIndex.value ? records.value[stepIndex.value] : null
)

function openTopic(topic: SpeakingTopic) {
    activeTopic.value = topic
    stepIndex.value = 0
    records.value = []
    finished.value = false
    reset()
}

async function speakNow() {
    const step = currentStep.value

    if (!step || isListening.value) return

    reset()

    await startListening()

    if (!transcript.value) return

    const score =
        step.kind === 'repeat'
            ? checkPronunciation(step.prompt, transcript.value).score
            : null

    records.value[stepIndex.value] = {
        step,
        transcript: transcript.value,
        score,
    }

    /*
     * Only repeat steps have an objective pass/fail (transcript match).
     * Open answers are recorded as completed activity without a correctness
     * claim — we must not grade free speech without a real evaluator.
     */
    if (step.kind === 'repeat' && score !== null) {
        performanceStore.record({
            skill: 'speaking',
            activityId: `${activeTopic.value?.id}-step-${stepIndex.value}`,
            lessonId: activeTopic.value?.id ?? null,
            difficulty: activeTopic.value?.difficulty ?? null,
            result: score >= 80 ? 'correct' : 'incorrect',
            confidence: score / 100,
        })
    }
}

function retry() {
    records.value.splice(stepIndex.value, 1)
    reset()
}

function nextStep() {
    if (!activeTopic.value) return

    reset()

    if (stepIndex.value < activeTopic.value.steps.length - 1) {
        stepIndex.value++
        return
    }

    finished.value = true
}

function backToList() {
    activeTopic.value = null
    records.value = []
    stepIndex.value = 0
    finished.value = false
    reset()
}

onMounted(async () => {
    loading.value = true

    try {
        topics.value = (await loadSpeakingManifest()).topics
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load speaking topics'
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <div class="mx-auto max-w-3xl">
        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <!-- LIST -->
        <div v-if="!activeTopic">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900">Guided Speaking</h1>
                <p class="mt-2 text-gray-500">
                    Topic-based speaking out loud: repeat model sentences, then answer open
                    questions. For word-by-word pronunciation drills, use
                    <RouterLink to="/speaking-practice" class="underline hover:text-black">Speaking Practice</RouterLink>.
                </p>
            </div>

            <p v-if="!isSupported" class="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Speech recognition is not supported in this browser — you can still read the
                prompts aloud, but transcripts won't be captured.
            </p>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading...</div>

            <div class="grid gap-3">
                <button
                    v-for="topic in topics"
                    :key="topic.id"
                    type="button"
                    class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    @click="openTopic(topic)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-900">{{ topic.title }}</p>
                        <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {{ topic.cefrLevel }}
                        </span>
                    </div>
                    <p v-if="topic.description" class="mt-1 text-sm text-gray-500">{{ topic.description }}</p>
                    <p class="mt-2 text-xs text-gray-400">
                        {{ topic.steps.length }} steps
                        <span v-if="topic.estimatedDuration"> · ~{{ topic.estimatedDuration }} min</span>
                    </p>
                </button>
            </div>
        </div>

        <!-- SESSION COMPLETE -->
        <div v-else-if="finished">
            <div class="rounded-2xl border bg-white p-10 text-center shadow-sm">
                <div class="text-5xl">🎙️</div>
                <h2 class="mt-4 text-2xl font-bold">Topic complete</h2>
                <p class="mt-2 text-gray-500">Review what you said below.</p>
                <button
                    type="button"
                    class="mt-6 rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="backToList"
                >
                    All topics
                </button>
            </div>

            <div class="mt-6 space-y-3">
                <div
                    v-for="(record, index) in records"
                    :key="index"
                    class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                    <p class="text-sm text-gray-500">{{ record.step.prompt }}</p>
                    <p class="mt-2 font-medium text-gray-900">🗣 {{ record.transcript || '(no transcript)' }}</p>
                    <p v-if="record.score !== null" class="mt-1 text-xs text-gray-400">
                        Transcript match: {{ record.score }}%
                    </p>
                </div>
            </div>
        </div>

        <!-- STEP -->
        <div v-else-if="currentStep">
            <div class="mb-6 flex items-center justify-between text-sm text-gray-500">
                <button type="button" class="hover:text-black" @click="backToList">
                    ← {{ activeTopic.title }}
                </button>
                <span>Step {{ stepIndex + 1 }} / {{ activeTopic.steps.length }}</span>
            </div>

            <div class="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <p class="text-sm font-medium uppercase tracking-wide text-gray-400">
                    {{ currentStep.kind === 'repeat' ? 'Repeat the sentence' : 'Answer freely' }}
                </p>

                <div class="mt-4 flex items-center justify-center gap-2">
                    <h2 class="text-xl font-semibold text-gray-900">{{ currentStep.prompt }}</h2>
                    <SpeechButton :text="currentStep.prompt" lang="en-US" />
                </div>

                <p v-if="currentStep.promptPersian" class="mt-2 text-sm text-gray-500" dir="rtl">
                    {{ currentStep.promptPersian }}
                </p>

                <div v-if="currentStep.usefulPhrases?.length" class="mt-4 flex flex-wrap justify-center gap-2">
                    <span
                        v-for="phrase in currentStep.usefulPhrases"
                        :key="phrase"
                        class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
                    >
                        {{ phrase }}
                    </span>
                </div>

                <!-- Record -->
                <div v-if="!currentRecord" class="mt-8">
                    <button
                        v-if="!isListening"
                        type="button"
                        class="rounded-full bg-black px-8 py-4 text-lg text-white hover:bg-gray-800 disabled:opacity-50"
                        :disabled="!isSupported"
                        @click="speakNow"
                    >
                        🎙 Speak
                    </button>
                    <div v-else class="rounded-lg bg-gray-100 px-8 py-4 text-gray-600">
                        🎙 Listening...
                    </div>

                    <p v-if="speechError" class="mt-3 text-sm text-red-500">{{ speechError }}</p>

                    <button
                        type="button"
                        class="mt-6 block w-full text-sm text-gray-400 hover:text-black"
                        @click="nextStep"
                    >
                        Skip this step →
                    </button>
                </div>

                <!-- Result -->
                <div v-else class="mt-8">
                    <div class="rounded-xl bg-gray-50 p-4 text-left">
                        <p class="text-xs text-gray-500">You said:</p>
                        <p class="mt-1 font-medium text-gray-900">{{ currentRecord.transcript }}</p>
                    </div>

                    <p v-if="currentRecord.score !== null" class="mt-3 text-sm" :class="currentRecord.score >= 80 ? 'text-green-600' : 'text-amber-600'">
                        Transcript match: {{ currentRecord.score }}%
                        <span class="block text-xs text-gray-400">
                            (how closely the speech recognizer's transcript matches the model sentence — not phoneme-level pronunciation scoring)
                        </span>
                    </p>

                    <div class="mt-6 flex justify-center gap-3">
                        <button type="button" class="rounded-xl border px-5 py-3 text-gray-600 hover:bg-gray-100" @click="retry">
                            Try again
                        </button>
                        <button type="button" class="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800" @click="nextStep">
                            {{ stepIndex === activeTopic.steps.length - 1 ? 'Finish' : 'Next' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
