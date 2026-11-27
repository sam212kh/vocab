<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadWritingManifest } from '../services/writingContent'
import { buildWritingCurriculum, writingStagesFor, type WritingStage } from '../services/writingCurriculum'
import { countWords, validateAnswer } from '../services/exerciseEngine'
import {
    createAIWritingEvaluator,
    performanceCategoriesFromEvaluation,
} from '../services/writingEvaluation'
import { AIClientError } from '../services/aiClient'
import { useWritingHistoryStore } from '../stores/writingHistory'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { usePerformanceStore } from '../stores/performance'
import { useAISettingsStore } from '../stores/aiSettings'
import { useMistakesStore } from '../stores/mistakes'
import { useToastStore } from '../stores/toast'

import WritingFeedback from '../components/writing/WritingFeedback.vue'

import type { WritingEvaluation, WritingPrompt, WritingSubmission } from '../types/writing'
import type { WritingResponseExercise } from '../types/exercise'
import { writingEvidenceInput } from '../services/writingEvidence'

const writingHistoryStore = useWritingHistoryStore()
const learningEvidenceStore = useLearningEvidenceStore()
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
const assistanceLevels = ref<WritingSubmission['assistanceLevels']>([])

function addAssistance(level: WritingSubmission['assistanceLevels'][number]) {
    if (!assistanceLevels.value.includes(level)) {
        assistanceLevels.value = [...assistanceLevels.value, level]
    }
}

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

const curriculumPrompts = computed(() => buildWritingCurriculum(prompts.value))
const currentStages = computed(() => activePrompt.value ? writingStagesFor(activePrompt.value.promptType) : [])

const stageLabels: Record<WritingStage, string> = {
    understand: 'Understand the task',
    vocabulary: 'Prepare vocabulary',
    structure: 'Plan the structure',
    guided: 'Build with guidance',
    independent: 'Write independently',
    transfer: 'Reuse in a new context',
}

const structureHint = computed(() => {
    const type = activePrompt.value?.promptType
    if (!type) return ''
    if (type === 'email' || type === 'professional') return 'Plan an opening, the main message, and a clear closing.'
    if (type === 'opinion' || type === 'essay') return 'State your position, give reasons or examples, then close your idea.'
    if (type === 'summary') return 'Start with the main idea, then include only the most important supporting points.'
    if (type === 'paragraph' || type === 'journal') return 'Use a clear first sentence, connected details, and a closing sentence.'
    return 'Check the subject, verb, and order of the main parts of the sentence.'
})

function openPrompt(prompt: WritingPrompt) {
    activePrompt.value = prompt
    draft.value = ''
    submitted.value = false
    constraintIssues.value = []
    showExample.value = false
    assistanceLevels.value = []
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
        constraintIssues.value,
        assistanceLevels.value
    )

    currentSubmissionId.value = submission.id

    /* Deterministic constraints are preserved as unverified evidence. */
    learningEvidenceStore.record(writingEvidenceInput(
        prompt.id,
        result.correct,
        assistanceLevels.value,
        'deterministic',
    ))

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
    assistanceLevels.value = []
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

        learningEvidenceStore.record(writingEvidenceInput(
            prompt.id,
            errorCategories.length === 0,
            assistanceLevels.value,
            'ai-verified',
            result.evaluatedAt,
        ))

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
                <h1>Writing</h1>
                <p class="mt-2 text-gray-500">
                    Build from understanding and structure to independent writing. Your original
                    text is preserved, and AI feedback is optional teaching feedback—not a certified score.
                </p>
            </div>

            <div v-if="loading" class="py-12 text-center text-gray-500">Loading prompts...</div>

            <div class="grid gap-3 sm:grid-cols-2">
                <button
                v-for="prompt in curriculumPrompts"
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
            <button type="button" class="btn-ghost -ml-3 mb-2" @click="backToList">
                ← All prompts
            </button>

            <h1>{{ activePrompt.title }}</h1>

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

            <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p class="text-xs font-semibold uppercase tracking-wide text-gray-400">Writing path</p>
                <ol class="mt-3 grid gap-2 sm:grid-cols-3">
                    <li
                        v-for="(stage, index) in currentStages"
                        :key="stage"
                        class="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
                    >
                        <span class="mr-1 text-xs text-gray-400">{{ index + 1 }}</span>{{ stageLabels[stage] }}
                    </li>
                </ol>
            </div>

            <div class="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                <p class="text-sm font-semibold text-blue-900">Need a hint?</p>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button
                        v-if="activePrompt.requiredElements?.length"
                        type="button"
                        class="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800"
                        @click="addAssistance('vocabulary')"
                    >
                        Vocabulary hint
                    </button>
                    <button
                        type="button"
                        class="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800"
                        @click="addAssistance('grammar')"
                    >
                        Grammar hint
                    </button>
                    <button
                        type="button"
                        class="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800"
                        @click="addAssistance('structure')"
                    >
                        Structure hint
                    </button>
                </div>
                <p v-if="assistanceLevels.includes('vocabulary') && activePrompt.requiredElements?.length" class="mt-3 text-sm text-blue-900">
                    Try to use: {{ activePrompt.requiredElements.join(', ') }}
                </p>
                <p v-if="assistanceLevels.includes('grammar')" class="mt-3 text-sm text-blue-900">
                    Grammar target: {{ activePrompt.instructions }}
                </p>
                <p v-if="assistanceLevels.includes('structure')" class="mt-3 text-sm text-blue-900">
                    {{ structureHint }}
                </p>
                <p v-if="assistanceLevels.length" class="mt-3 text-xs text-blue-700">
                    Assistance is recorded and is not treated as independent mastery.
                </p>
            </div>

            <div v-if="!submitted" class="mt-4">
                <textarea
                    v-model="draft"
                    rows="10"
                    class="field w-full p-4 shadow-sm"
                    placeholder="Write here..."
                    dir="auto"
                />

                <div class="mt-2 flex items-center justify-between">
                    <span class="text-sm text-gray-400">{{ wordCount }} words</span>
                    <button
                        type="button"
                        class="btn-primary btn-lg"
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
                        {{ constraintIssues.length ? 'Saved — with notes' : 'Saved' }}
                    </p>
                    <p v-for="issue in constraintIssues" :key="issue" class="mt-1 text-sm text-amber-700">
                        {{ issue }}
                    </p>
                    <p class="mt-2 text-xs text-gray-500">
                        These are objective checks only. Grammar and naturalness feedback will come
                        from the optional WritingEvaluator — nothing here pretends to be a certified assessment.
                    </p>
                    <p v-if="assistanceLevels.length" class="mt-2 text-xs text-blue-700">
                        Hints used: {{ assistanceLevels.join(', ') }}. This attempt remains saved, but it is not independent evidence.
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
                            class="btn-primary btn-lg mt-3"
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
                        Get AI feedback on this text
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
                    <button type="button" class="btn-primary btn-lg" @click="backToList">
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
