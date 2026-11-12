<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'

import { loadScenarios } from '../services/conversationContent'
import {
    requestSessionSummary,
    requestTutorTurn,
} from '../services/conversationService'
import { evidenceForTurn } from '../services/conversationEvidence'
import { AIClientError } from '../services/aiClient'

import { useConversationsStore } from '../stores/conversations'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useAISettingsStore } from '../stores/aiSettings'
import { useSessionSettingsStore } from '../stores/sessionSettings'
import { useMistakesStore } from '../stores/mistakes'
import { usePerformanceStore } from '../stores/performance'
import { useSavedExpressionsStore } from '../stores/savedExpressions'
import { useToastStore } from '../stores/toast'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import MessageBubble from '../components/conversation/MessageBubble.vue'

import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'
import type {
    ConversationMode,
    ConversationSession,
    FeedbackMode,
    RoleplayScenario,
} from '../types/conversation'

const conversationsStore = useConversationsStore()
const learnerProfileStore = useLearnerProfileStore()
const aiSettingsStore = useAISettingsStore()
const sessionSettingsStore = useSessionSettingsStore()
const mistakesStore = useMistakesStore()
const performanceStore = usePerformanceStore()
const savedExpressionsStore = useSavedExpressionsStore()
const toastStore = useToastStore()

const {
    isSupported: voiceSupported,
    isListening,
    transcript,
    confidence,
    error: voiceError,
    startListening,
    reset: resetVoice,
} = useSpeakingPractice()

/* ---------- state ---------- */

const phase = ref<'setup' | 'chat' | 'summary'>('setup')
const scenarios = ref<RoleplayScenario[]>([])
const scenarioError = ref('')

const setupMode = ref<ConversationMode>('free')
const setupScenarioId = ref<string | null>(null)
const setupDifficulty = ref<CefrLevel>(learnerProfileStore.profile.selfReportedLevel ?? 'B1')
const setupFeedbackMode = ref<FeedbackMode>('gentle')

const session = ref<ConversationSession | null>(null)
const draft = ref('')
const draftFromVoice = ref(false)
const draftVoiceConfidence = ref<number | null>(null)
const waitingForTutor = ref(false)
const turnError = ref('')
const summarizing = ref(false)
const summaryError = ref('')

const messagesContainer = ref<HTMLElement | null>(null)

/* ---------- derived ---------- */

const MODES: { id: ConversationMode; label: string; hint: string }[] = [
    { id: 'free', label: 'Free Conversation', hint: 'Natural chat on topics you enjoy' },
    { id: 'daily-life', label: 'Daily Life', hint: 'Routines, plans, everyday topics' },
    { id: 'professional', label: 'Professional', hint: 'Work and career English' },
    { id: 'interview', label: 'Job Interview', hint: 'Realistic interview questions' },
    { id: 'workplace', label: 'Workplace', hint: 'Meetings, updates, colleagues' },
    { id: 'technical', label: 'Technical', hint: 'Software and engineering talk' },
    { id: 'travel', label: 'Travel', hint: 'Everyday situations abroad' },
    { id: 'roleplay', label: 'Roleplay', hint: 'Structured real-world scenarios' },
]

const FEEDBACK_MODES: { id: FeedbackMode; label: string; hint: string }[] = [
    { id: 'natural', label: 'Natural', hint: 'No corrections — just talk' },
    { id: 'gentle', label: 'Gentle', hint: 'Occasional important corrections' },
    { id: 'teacher', label: 'Teacher', hint: 'Detailed feedback on each message' },
]

const activeScenario = computed(() =>
    session.value?.scenarioId
        ? scenarios.value.find(item => item.id === session.value!.scenarioId) ?? null
        : null
)

const speakingEnabled = computed(() => sessionSettingsStore.settings.speakingEnabled)

const cloudSelected = computed(() => aiSettingsStore.settings.provider === 'cloud')

/* ---------- setup ---------- */

function scrollToBottom() {
    void nextTick(() => {
        messagesContainer.value?.scrollTo({ top: messagesContainer.value.scrollHeight })
    })
}

async function startConversation() {
    if (!aiSettingsStore.settings.enabled) {
        toastStore.push('AI is disabled in AI Settings — conversation needs it.', 'error')
        return
    }

    const scenario = setupMode.value === 'roleplay'
        ? scenarios.value.find(item => item.id === setupScenarioId.value) ?? null
        : null

    if (setupMode.value === 'roleplay' && !scenario) {
        toastStore.push('Pick a scenario first.', 'info')
        return
    }

    const created = conversationsStore.startSession({
        mode: setupMode.value,
        scenarioId: scenario?.id ?? null,
        difficulty: setupDifficulty.value,
        feedbackMode: setupFeedbackMode.value,
    })

    session.value = created
    phase.value = 'chat'
    turnError.value = ''

    /* Roleplay opens with the scenario's deterministic opening line;
     * other modes open with a generated tutor greeting. */
    if (scenario) {
        conversationsStore.appendMessage(created.id, {
            role: 'tutor',
            text: scenario.opening,
            inputMethod: null,
            voiceConfidence: null,
            corrections: [],
            translation: null,
        })
        scrollToBottom()
    } else {
        await requestOpening(created)
    }
}

async function requestOpening(createdSession: ConversationSession) {
    waitingForTutor.value = true

    try {
        /* Seed with a synthetic learner "hello" that is not persisted. */
        const seeded: ConversationSession = {
            ...createdSession,
            messages: [{
                id: 'seed',
                role: 'learner',
                text: 'Hi! Please start our conversation with a short, friendly opening and one question.',
                inputMethod: null,
                voiceConfidence: null,
                corrections: [],
                translation: null,
                timestamp: Date.now(),
            }],
            feedbackMode: 'natural',
        }

        const turn = await requestTutorTurn(seeded, null)

        conversationsStore.appendMessage(createdSession.id, {
            role: 'tutor',
            text: turn.reply,
            inputMethod: null,
            voiceConfidence: null,
            corrections: [],
            translation: null,
        })
    } catch (err) {
        turnError.value = describeError(err)
    } finally {
        waitingForTutor.value = false
        scrollToBottom()
    }
}

function resumeSession(existing: ConversationSession) {
    session.value = existing
    phase.value = 'chat'
    scrollToBottom()
}

/* ---------- chat ---------- */

function describeError(err: unknown): string {
    if (err instanceof AIClientError) {
        const messages: Record<string, string> = {
            'gateway-unreachable': 'The AI service is not running. Your conversation is saved — start it and retry.',
            unreachable: 'The AI provider is not reachable. Your conversation is saved.',
            timeout: 'The AI provider timed out. Your conversation is saved — retry.',
            'rate-limited': 'Rate limit reached — wait a minute and retry.',
            'invalid-model-output': 'The model returned an unusable response — retry or switch model in AI Settings.',
        }

        return messages[err.code] ?? `${err.message} Your conversation is saved.`
    }

    return 'Unexpected error. Your conversation is saved.'
}

async function sendDraft() {
    const active = session.value

    if (!active || waitingForTutor.value) return

    const text = draft.value.trim()

    if (!text) return

    const inputMethod = draftFromVoice.value ? 'voice' as const : 'text' as const
    const voiceConfidence = draftFromVoice.value ? draftVoiceConfidence.value : null

    const learnerMessage = conversationsStore.appendMessage(active.id, {
        role: 'learner',
        text,
        inputMethod,
        voiceConfidence,
        corrections: [],
        translation: null,
    })

    draft.value = ''
    draftFromVoice.value = false
    draftVoiceConfidence.value = null
    turnError.value = ''
    waitingForTutor.value = true
    scrollToBottom()

    try {
        const turn = await requestTutorTurn(active, activeScenario.value)

        if (learnerMessage && turn.corrections.length) {
            conversationsStore.setCorrections(active.id, learnerMessage.id, turn.corrections)

            /* Mistake tracking — per-message dedup key, same store as writing. */
            mistakesStore.recordFromEvaluation(
                `${active.id}:${learnerMessage.id}`,
                turn.corrections.map(correction => ({
                    original: correction.original,
                    corrected: correction.corrected,
                    category: correction.category,
                    kind: correction.kind,
                    explanation: correction.explanation,
                    explanationPersian: correction.explanationPersian,
                    example: correction.example,
                }))
            )
        }

        /*
         * Performance evidence rules live in conversationEvidence.ts:
         * speaking events only for voice input, correctness events only
         * when a feedback mode produced evidence.
         */
        if (learnerMessage) {
            for (const event of evidenceForTurn({
                mode: active.mode,
                scenarioId: active.scenarioId,
                feedbackMode: active.feedbackMode,
                inputMethod,
                voiceConfidence,
                corrections: turn.corrections,
            })) {
                performanceStore.record(event)
            }
        }

        conversationsStore.appendMessage(active.id, {
            role: 'tutor',
            text: turn.reply,
            inputMethod: null,
            voiceConfidence: null,
            corrections: [],
            translation: null,
        })

        if (turn.fallbackUsed) {
            toastStore.push(`This reply came from the fallback provider (${turn.provider}).`, 'info')
        }
    } catch (err) {
        turnError.value = describeError(err)
    } finally {
        waitingForTutor.value = false
        scrollToBottom()
    }
}

async function recordVoice() {
    if (!voiceSupported || isListening.value) return

    resetVoice()
    await startListening()

    if (transcript.value) {
        /* Transcript is editable before sending — recognition is not perfect. */
        draft.value = transcript.value
        draftFromVoice.value = true
        draftVoiceConfidence.value = confidence.value || null
    }
}

function changeFeedbackMode(mode: FeedbackMode) {
    if (!session.value) return

    conversationsStore.changeFeedbackMode(session.value.id, mode)
    session.value.feedbackMode = mode
}

/* ---------- end + summary ---------- */

async function endConversation() {
    const active = session.value

    if (!active) return

    const hasLearnerMessages = active.messages.some(message => message.role === 'learner')

    if (!hasLearnerMessages) {
        conversationsStore.endSession(active.id)
        backToSetup()
        return
    }

    summarizing.value = true
    summaryError.value = ''
    phase.value = 'summary'

    try {
        const summary = await requestSessionSummary(active, activeScenario.value)

        conversationsStore.endSession(active.id, summary)

        /* Summary corrections feed mistake tracking too (deduped per session). */
        mistakesStore.recordFromEvaluation(
            `${active.id}:summary`,
            summary.corrections.map(correction => ({
                original: correction.original,
                corrected: correction.corrected,
                category: correction.category,
                kind: correction.kind,
                explanation: correction.explanation,
                explanationPersian: correction.explanationPersian,
                example: '',
            }))
        )
    } catch (err) {
        /* Summary failure must never lose the conversation. */
        conversationsStore.endSession(active.id)
        summaryError.value = describeError(err)
    } finally {
        summarizing.value = false
    }
}

function saveExpressionFromSummary(expression: string, meaning: string, meaningPersian: string) {
    savedExpressionsStore.saveExpression(expression, meaning, meaningPersian, session.value?.id ?? null)
}

function deleteSession(sessionId: string) {
    conversationsStore.deleteSession(sessionId)
    savedExpressionsStore.detachSession(sessionId)
    toastStore.push('Conversation deleted.', 'info')
}

function backToSetup() {
    session.value = null
    phase.value = 'setup'
    draft.value = ''
    turnError.value = ''
    summaryError.value = ''
}

const sessionDurationMinutes = computed(() => {
    const active = session.value

    if (!active) return 0

    const end = active.endedAt ?? Date.now()

    return Math.max(1, Math.round((end - active.startedAt) / 60000))
})

onMounted(async () => {
    try {
        scenarios.value = await loadScenarios()
    } catch (err) {
        scenarioError.value = err instanceof Error ? err.message : 'Failed to load scenarios'
    }

    /* Resume a dangling active session if one exists. */
    if (conversationsStore.activeSession) {
        session.value = conversationsStore.activeSession
        phase.value = 'chat'
        scrollToBottom()
    }
})
</script>

<template>
    <div class="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col">
        <!-- ============ SETUP ============ -->
        <div v-if="phase === 'setup'" class="overflow-y-auto">
            <div class="mb-6">
                <h1 class="text-3xl font-bold text-gray-900">Conversation</h1>
                <p class="mt-2 text-gray-500">
                    Practice real English with an AI tutor — text, or voice when Speaking is on.
                </p>
            </div>

            <p v-if="cloudSelected" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Cloud provider selected: your conversation messages will be sent to the configured cloud API.
                Switch to Local (Ollama) in AI Settings to keep everything on your machine.
            </p>

            <p v-if="scenarioError" class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {{ scenarioError }}
            </p>

            <!-- Mode -->
            <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Mode</h2>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                    v-for="mode in MODES"
                    :key="mode.id"
                    type="button"
                    class="rounded-xl border p-3 text-left transition"
                    :class="setupMode === mode.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'"
                    @click="setupMode = mode.id"
                >
                    <p class="text-sm font-semibold">{{ mode.label }}</p>
                    <p class="mt-0.5 text-xs" :class="setupMode === mode.id ? 'text-gray-300' : 'text-gray-400'">{{ mode.hint }}</p>
                </button>
            </div>

            <!-- Scenario picker -->
            <template v-if="setupMode === 'roleplay'">
                <h2 class="mb-2 mt-5 text-sm font-semibold uppercase tracking-wider text-gray-400">Scenario</h2>
                <div class="grid gap-2 sm:grid-cols-2">
                    <button
                        v-for="scenario in scenarios"
                        :key="scenario.id"
                        type="button"
                        class="rounded-xl border p-3 text-left transition"
                        :class="setupScenarioId === scenario.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:bg-gray-50'"
                        @click="setupScenarioId = scenario.id"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <p class="text-sm font-semibold">{{ scenario.title }}</p>
                            <span class="shrink-0 rounded-full px-1.5 py-0.5 text-xs" :class="setupScenarioId === scenario.id ? 'bg-white/20' : 'bg-gray-100 text-gray-500'">
                                {{ scenario.cefrLevel }}
                            </span>
                        </div>
                        <p class="mt-1 text-xs" :class="setupScenarioId === scenario.id ? 'text-gray-300' : 'text-gray-400'">
                            You: {{ scenario.learnerRole }}
                        </p>
                    </button>
                </div>
            </template>

            <!-- Difficulty + feedback -->
            <div class="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Difficulty</h2>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="level in CEFR_LEVELS"
                            :key="level"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-sm transition"
                            :class="setupDifficulty === level ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            @click="setupDifficulty = level"
                        >
                            {{ level }}
                        </button>
                    </div>
                </div>

                <div>
                    <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Feedback</h2>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="mode in FEEDBACK_MODES"
                            :key="mode.id"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-sm transition"
                            :class="setupFeedbackMode === mode.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-100'"
                            :title="mode.hint"
                            @click="setupFeedbackMode = mode.id"
                        >
                            {{ mode.label }}
                        </button>
                    </div>
                </div>
            </div>

            <button
                type="button"
                class="mt-6 w-full rounded-xl bg-black px-6 py-3.5 font-semibold text-white hover:bg-gray-800"
                @click="startConversation"
            >
                Start conversation
            </button>

            <!-- History -->
            <div v-if="conversationsStore.endedSessions.length" class="mt-8 pb-8">
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
                    Previous conversations
                </h2>
                <div class="space-y-2">
                    <div
                        v-for="item in conversationsStore.endedSessions"
                        :key="item.id"
                        class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
                    >
                        <div class="min-w-0">
                            <p class="font-medium text-gray-900">
                                {{ MODES.find(m => m.id === item.mode)?.label ?? item.mode }}
                                <span v-if="item.scenarioId" class="text-gray-400">
                                    · {{ scenarios.find(s => s.id === item.scenarioId)?.title ?? item.scenarioId }}
                                </span>
                            </p>
                            <p class="text-xs text-gray-400">
                                {{ new Date(item.startedAt).toLocaleString() }}
                                · {{ item.messages.filter(m => m.role === 'learner').length }} messages
                                <span v-if="item.summary"> · summarized</span>
                            </p>
                        </div>
                        <div class="flex shrink-0 gap-2">
                            <button type="button" class="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" @click="resumeSession(item)">
                                View
                            </button>
                            <button type="button" class="rounded-lg px-2 py-1 text-red-400 hover:bg-red-50" @click="deleteSession(item.id)">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============ CHAT ============ -->
        <template v-else-if="phase === 'chat' && session">
            <!-- Header -->
            <div class="flex items-center justify-between border-b pb-3">
                <div class="min-w-0">
                    <p class="truncate font-semibold text-gray-900">
                        {{ activeScenario?.title ?? MODES.find(m => m.id === session!.mode)?.label }}
                    </p>
                    <p class="text-xs text-gray-400">{{ session.difficulty }} · {{ sessionDurationMinutes }} min</p>
                </div>

                <div class="flex items-center gap-2">
                    <select
                        :value="session.feedbackMode"
                        class="rounded-lg border px-2 py-1 text-xs"
                        :disabled="session.endedAt !== null"
                        @change="changeFeedbackMode(($event.target as HTMLSelectElement).value as FeedbackMode)"
                    >
                        <option value="natural">Natural</option>
                        <option value="gentle">Gentle</option>
                        <option value="teacher">Teacher</option>
                    </select>

                    <button
                        v-if="session.endedAt === null"
                        type="button"
                        class="rounded-lg border px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        @click="endConversation"
                    >
                        End
                    </button>
                    <button
                        v-else
                        type="button"
                        class="rounded-lg border px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        @click="backToSetup"
                    >
                        ← Back
                    </button>
                </div>
            </div>

            <!-- Messages -->
            <div ref="messagesContainer" class="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
                <MessageBubble
                    v-for="message in session.messages"
                    :key="message.id"
                    :message="message"
                    :session-id="session.id"
                />

                <div v-if="waitingForTutor" class="flex justify-start">
                    <div class="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                        <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 align-middle" />
                        <span class="ml-2 text-sm text-gray-400">thinking…</span>
                    </div>
                </div>

                <div v-if="turnError" class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    {{ turnError }}
                </div>
            </div>

            <!-- Input -->
            <div v-if="session.endedAt === null" class="border-t pt-3">
                <p v-if="draftFromVoice" class="mb-1 text-xs text-gray-400">
                    🎙 Transcribed — edit before sending if the recognition made mistakes.
                </p>
                <p v-if="voiceError" class="mb-1 text-xs text-red-500">{{ voiceError }}</p>

                <div class="flex items-end gap-2">
                    <button
                        v-if="speakingEnabled && voiceSupported"
                        type="button"
                        class="shrink-0 rounded-full p-3 text-lg transition"
                        :class="isListening ? 'animate-pulse bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                        :title="isListening ? 'Listening…' : 'Speak your message'"
                        :disabled="waitingForTutor"
                        @click="recordVoice"
                    >
                        🎙
                    </button>

                    <textarea
                        v-model="draft"
                        rows="1"
                        dir="auto"
                        placeholder="Write in English…"
                        class="max-h-32 flex-1 resize-y rounded-xl border px-3 py-2.5 outline-none focus:border-gray-900"
                        :disabled="waitingForTutor"
                        @keydown.enter.exact.prevent="sendDraft"
                        @input="draftFromVoice = false"
                    />

                    <button
                        type="button"
                        class="shrink-0 rounded-xl bg-black px-4 py-2.5 font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                        :disabled="!draft.trim() || waitingForTutor"
                        @click="sendDraft"
                    >
                        Send
                    </button>
                </div>

                <p v-if="!speakingEnabled" class="mt-1 text-xs text-gray-400">
                    Voice input is off (Speaking disabled in Daily Session settings). Text chat works normally.
                </p>
            </div>
        </template>

        <!-- ============ SUMMARY ============ -->
        <div v-else-if="phase === 'summary'" class="overflow-y-auto pb-8">
            <div v-if="summarizing" class="py-16 text-center">
                <div class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                <p class="mt-4 text-gray-500">Writing your session summary…</p>
            </div>

            <template v-else>
                <div class="mb-6 text-center">
                    <div class="text-5xl">💬</div>
                    <h1 class="mt-3 text-2xl font-bold text-gray-900">Conversation complete</h1>
                    <p class="mt-1 text-sm text-gray-400">
                        {{ sessionDurationMinutes }} min ·
                        {{ session?.messages.filter(m => m.role === 'learner').length ?? 0 }} messages from you
                    </p>
                </div>

                <p v-if="summaryError" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    {{ summaryError }} The conversation itself was saved.
                </p>

                <template v-if="session?.summary">
                    <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p class="text-gray-800">{{ session.summary.overall }}</p>
                        <p class="mt-2 text-xs text-gray-300">AI teaching feedback — not a certified assessment</p>
                    </div>

                    <div class="mt-4 grid gap-4 sm:grid-cols-2">
                        <div v-if="session.summary.strengths.length" class="rounded-2xl border border-green-100 bg-green-50/50 p-4">
                            <h3 class="text-sm font-semibold text-green-800">Strengths</h3>
                            <ul class="mt-2 list-inside list-disc space-y-1 text-sm text-gray-700">
                                <li v-for="item in session.summary.strengths" :key="item">{{ item }}</li>
                            </ul>
                        </div>

                        <div v-if="session.summary.improvements.length" class="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                            <h3 class="text-sm font-semibold text-amber-800">Work on next</h3>
                            <ul class="mt-2 list-inside list-disc space-y-1 text-sm text-gray-700">
                                <li v-for="item in session.summary.improvements" :key="item">{{ item }}</li>
                            </ul>
                        </div>
                    </div>

                    <div v-if="session.summary.corrections.length" class="mt-4 space-y-2">
                        <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-400">Key corrections</h3>
                        <div
                            v-for="(correction, index) in session.summary.corrections"
                            :key="index"
                            class="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
                        >
                            <p class="text-gray-500 line-through decoration-red-300">{{ correction.original }}</p>
                            <p class="font-medium text-gray-900">{{ correction.corrected }}</p>
                            <p class="mt-1 text-gray-600">{{ correction.explanation }}</p>
                            <p v-if="correction.explanationPersian" class="mt-1 rounded bg-gray-50 p-1.5 text-gray-600" dir="rtl">
                                {{ correction.explanationPersian }}
                            </p>
                        </div>
                    </div>

                    <div v-if="session.summary.usefulExpressions.length" class="mt-4">
                        <h3 class="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Useful expressions</h3>
                        <div class="space-y-2">
                            <div
                                v-for="item in session.summary.usefulExpressions"
                                :key="item.expression"
                                class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
                            >
                                <div class="min-w-0">
                                    <p class="font-medium text-gray-900">{{ item.expression }}</p>
                                    <p class="text-gray-500">{{ item.meaning }}</p>
                                    <p v-if="item.meaningPersian" class="text-gray-500" dir="rtl">{{ item.meaningPersian }}</p>
                                </div>
                                <button
                                    type="button"
                                    class="shrink-0 rounded-lg border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                                    @click="saveExpressionFromSummary(item.expression, item.meaning, item.meaningPersian)"
                                >
                                    ☆ Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <p v-if="session.summary.suggestedNextActivity" class="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
                        <span class="font-medium">Next:</span> {{ session.summary.suggestedNextActivity }}
                    </p>
                </template>

                <button
                    type="button"
                    class="mt-6 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800"
                    @click="backToSetup"
                >
                    Done
                </button>
            </template>
        </div>
    </div>
</template>
