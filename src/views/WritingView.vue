<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadWritingManifest } from '../services/writingContent'
import { countWords, validateAnswer } from '../services/exerciseEngine'
import {
    createAIWritingEvaluator,
    performanceCategoriesFromEvaluation,
} from '../services/writingEvaluation'
import { AIClientError } from '../services/aiClient'
import { useWritingHistoryStore } from '../stores/writingHistory'
import { usePerformanceStore } from '../stores/performance'
import { useAISettingsStore } from '../stores/aiSettings'
import { useMistakesStore } from '../stores/mistakes'
import { useToastStore } from '../stores/toast'

import WritingFeedback from '../components/writing/WritingFeedback.vue'

import type { WritingEvaluation, WritingPrompt } from '../types/writing'
import type { WritingResponseExercise } from '../types/exercise'

const writingHistoryStore = useWritingHistoryStore()
const performanceStore = usePerformanceStore()
const aiSettingsStore = useAISettingsStore()
const mistakesStore = useMistakesStore()
const toastStore = useToastStore()

const aiEvaluator = createAIWritingEvaluator()

const prompts = ref<WritingPrompt[]>([])
const loading = ref(false)
const error = ref('')

const activePrompt = ref<WritingPrompt | null>(null)
const draft = ref('')
const submitted = ref(false)
const constraintIssues = ref<string[]>([])
const showExample = ref(false)

/* AI evaluation state — the learner's text is never touched by any of it. */
const currentSubmissionId = ref<string | null>(null)
const evaluating = ref(false)
const evaluation = ref<WritingEvaluation | null>(null)
const evaluationError = ref('')

const wordCount = computed(() => countWords(draft.value))

const history = computed(() =>
    activePrompt.value
        ? writingHistoryStore.getSubmissionsForPrompt(activePrompt.value.id)
        : []
)

function openPrompt(prompt: WritingPrompt) {
    activePrompt.value = prompt
    draft.value = ''
    submitted.value = false
    constraintIssues.value = []
    showExample.value = false
    resetEvaluationState()
}

function resetEvaluationState() {
    currentSubmissionId.value = null
    evaluating.value = false
    evaluation.value = null
    evaluationError.value = ''
}

function backToList() {
    activePrompt.value = null
}

function submit() {
    const prompt = activePrompt.value

    if (!prompt || !draft.value.trim()) return

    /*
     * Reuse the exercise engine's deterministic writing checks — the only
     * automated judgement we can honestly make without an AI evaluator.
     */
    const exercise: WritingResponseExercise = {
        id: prompt.id,
        type: 'writing-response',
        skill: 'writing',
        prompt: prompt.instructions,
        minWords: prompt.minWords,
        maxWords: prompt.maxWords,
        requiredElements: prompt.requiredElements,
    }

    const result = validateAnswer(exercise, { kind: 'text', text: draft.value })

    constraintIssues.value = result.correct || !result.feedback ? [] : [result.feedback]

    const submission = writingHistoryStore.addSubmission(
        prompt.id,
        draft.value,
        result.correct,
        constraintIssues.value
    )

    currentSubmissionId.value = submission.id

    performanceStore.record({
        skill: 'writing',
        activityId: prompt.id,
        difficulty: prompt.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['task-constraints'],
    })

    submitted.value = true
}

function writeAgain() {
    draft.value = ''
    submitted.value = false
    constraintIssues.value = []
    showExample.value = false
    resetEvaluationState()
}

async function requestEvaluation() {
    const prompt = activePrompt.value
    const submissionId = currentSubmissionId.value

    if (!prompt || !submissionId || evaluating.value) return

    evaluating.value = true
    evaluationError.value = ''

    try {
        const result = await aiEvaluator.evaluate(prompt, draft.value)

        evaluation.value = result

        /* Persist (append, never overwrite) + feed learning intelligence. */
        writingHistoryStore.addEvaluation(submissionId, result)
        mistakesStore.recordFromEvaluation(submissionId, result.sentences)

        const errorCategories = performanceCategoriesFromEvaluation(result)

        performanceStore.record({
            skill: 'writing',
            activityId: `${prompt.id}-ai-evaluation`,
            lessonId: prompt.id,
            difficulty: prompt.difficulty ?? null,
            result: errorCategories.length ? 'incorrect' : 'correct',
            errorCategories,
            timeSpent: result.durationMs,
        })

        if (result.fallbackUsed) {
            toastStore.push(
                `Your chosen provider failed — this evaluation came from the fallback provider (${result.provider}).`,
                'info'
            )
        }
    } catch (err) {
        if (err instanceof AIClientError) {
            const messages: Record<string, string> = {
                'gateway-unreachable': 'The AI service is not running. Your text is saved — start the service and retry.',
                unreachable: 'The AI provider is not reachable. Your text is saved — check AI Settings and retry.',
                timeout: 'The AI provider timed out. Your text is saved — you can retry.',
                'model-unavailable': err.message,
                auth: 'Cloud API credentials were rejected on the server. Your text is saved.',
                'rate-limited': 'The AI provider is rate-limited right now. Your text is saved — retry in a minute.',
                'invalid-model-output': 'The model returned an unusable response. Your text is saved — retry or switch model in AI Settings.',
            }

            evaluationError.value = messages[err.code] ?? `${err.message} Your text is saved.`
        } else {
            evaluationError.value = 'Unexpected evaluation error. Your text is saved.'
        }
    } finally {
        evaluating.value = false
    }
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString()
}

onMounted(async () => {
    loading.value = true

    try {
        prompts.value = (await loadWritingManifest()).prompts
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load writing prompts'
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

        <!-- PROMPT LIST -->
        <div v-if="!activePrompt">
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-900">Writing</h1>
                <p class="mt-2 text-gray-500">
                    Regular writing practice with saved history. Automated feedback is limited to
                    objective checks (length, required elements) — intelligent correction arrives
                    with the AI tutor in a later phase.
                </p>
            </div>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading prompts...</div>

            <div class="grid gap-3 sm:grid-cols-2">
                <button
                    v-for="prompt in prompts"
                    :key="prompt.id"
                    type="button"
                    class="rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    @click="openPrompt(prompt)"
                >
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-900">{{ prompt.title }}</p>
                        <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {{ prompt.cefrLevel }}
                        </span>
                    </div>
                    <p class="mt-2 text-xs text-gray-400">
                        {{ prompt.promptType }}
                        <span v-if="prompt.estimatedDuration"> · ~{{ prompt.estimatedDuration }} min</span>
                        <span v-if="writingHistoryStore.getSubmissionsForPrompt(prompt.id).length">
                            · {{ writingHistoryStore.getSubmissionsForPrompt(prompt.id).length }} written
                        </span>
                    </p>
                </button>
            </div>
        </div>

        <!-- EDITOR -->
        <div v-else>
            <button type="button" class="mb-6 text-sm text-gray-500 hover:text-black" @click="backToList">
                ← All prompts
            </button>

            <h1 class="text-2xl font-bold text-gray-900">{{ activePrompt.title }}</h1>

            <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p class="text-gray-800">{{ activePrompt.instructions }}</p>
                <p
                    v-if="activePrompt.instructionsPersian"
                    class="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600"
                    dir="rtl"
                >
                    {{ activePrompt.instructionsPersian }}
                </p>
                <p class="mt-3 text-xs text-gray-400">
                    <span v-if="activePrompt.minWords">min {{ activePrompt.minWords }} words</span>
                    <span v-if="activePrompt.maxWords"> · max {{ activePrompt.maxWords }} words</span>
                    <span v-if="activePrompt.requiredElements?.length">
                        · try to use: {{ activePrompt.requiredElements.join(', ') }}
                    </span>
                </p>
            </div>

            <div v-if="!submitted" class="mt-4">
                <textarea
                    v-model="draft"
                    rows="10"
                    class="w-full rounded-2xl border border-gray-200 p-4 shadow-sm outline-none focus:border-gray-900"
                    placeholder="Write here..."
                    dir="auto"
                />

                <div class="mt-2 flex items-center justify-between">
                    <span class="text-sm text-gray-400">{{ wordCount }} words</span>
                    <button
                        type="button"
                        class="rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                        :disabled="!draft.trim()"
                        @click="submit"
                    >
                        Submit
                    </button>
                </div>
            </div>

            <!-- POST-SUBMIT -->
            <div v-else class="mt-4 space-y-4">
                <div
                    class="rounded-2xl border p-5"
                    :class="constraintIssues.length ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'"
                >
                    <p class="font-semibold" :class="constraintIssues.length ? 'text-amber-700' : 'text-green-700'">
                        {{ constraintIssues.length ? 'Saved — with notes' : '✅ Saved' }}
                    </p>
                    <p v-for="issue in constraintIssues" :key="issue" class="mt-1 text-sm text-amber-700">
                        {{ issue }}
                    </p>
                    <p class="mt-2 text-xs text-gray-500">
                        These are objective checks only. Grammar and naturalness feedback will come
                        from the AI tutor in a later phase — nothing here pretends to be that.
                    </p>
                </div>

                <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p class="text-xs font-medium uppercase tracking-wide text-gray-400">Your text</p>
                    <p class="mt-2 whitespace-pre-wrap text-gray-800" dir="auto">{{ draft }}</p>
                </div>

                <!-- AI evaluation -->
                <div v-if="aiSettingsStore.settings.enabled && !evaluation">
                    <div v-if="evaluating" class="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                        <div class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                        <p class="mt-3 text-sm text-gray-500">
                            Evaluating with {{ aiSettingsStore.settings.provider === 'ollama' ? 'the local model' : 'the cloud model' }}...
                            this can take a while.
                        </p>
                    </div>

                    <div v-else-if="evaluationError" class="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                        <p class="text-sm text-amber-800">{{ evaluationError }}</p>
                        <button
                            type="button"
                            class="mt-3 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
                            @click="requestEvaluation"
                        >
                            Retry evaluation
                        </button>
                    </div>

                    <button
                        v-else
                        type="button"
                        class="w-full rounded-2xl border-2 border-dashed border-gray-300 p-5 text-gray-600 transition hover:border-gray-900 hover:text-gray-900"
                        @click="requestEvaluation"
                    >
                        🤖 Get AI feedback on this text
                    </button>
                </div>

                <WritingFeedback
                    v-if="evaluation"
                    :evaluation="evaluation"
                    :original-text="draft"
                />

                <div v-if="activePrompt.exampleResponse">
                    <button
                        type="button"
                        class="text-sm font-medium text-gray-600 hover:text-black"
                        @click="showExample = !showExample"
                    >
                        {{ showExample ? '▾ Hide' : '▸ Show' }} example response
                    </button>
                    <div
                        v-if="showExample"
                        class="mt-2 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm whitespace-pre-wrap text-gray-700"
                    >{{ activePrompt.exampleResponse }}</div>
                </div>

                <div class="flex gap-3">
                    <button type="button" class="rounded-xl border px-5 py-3 text-gray-600 hover:bg-gray-100" @click="writeAgain">
                        Write another
                    </button>
                    <button type="button" class="rounded-xl bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800" @click="backToList">
                        All prompts
                    </button>
                </div>
            </div>

            <!-- HISTORY -->
            <div v-if="history.length" class="mt-8">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                    Previous attempts ({{ history.length }})
                </h2>
                <div class="space-y-3">
                    <details
                        v-for="item in history"
                        :key="item.id"
                        class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                        <summary class="cursor-pointer text-sm text-gray-600">
                            {{ formatDate(item.submittedAt) }} · {{ item.wordCount }} words
                            <span v-if="item.evaluations.length" class="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                {{ item.evaluations.length }} AI {{ item.evaluations.length === 1 ? 'evaluation' : 'evaluations' }}
                            </span>
                        </summary>
                        <p class="mt-3 whitespace-pre-wrap text-sm text-gray-800" dir="auto">{{ item.text }}</p>

                        <div v-if="item.evaluations.length" class="mt-4 border-t pt-4">
                            <WritingFeedback
                                :evaluation="item.evaluations[item.evaluations.length - 1]"
                                :original-text="item.text"
                            />
                        </div>
                    </details>
                </div>
            </div>
        </div>
    </div>
</template>
