<script setup lang="ts">
import AppIcon from '../components/ui/AppIcon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { loadRealLifeManifest, loadRealLifeScenario } from '../services/realLifeContent'
import { expressInEnglish, AIClientError } from '../services/aiClient'
import { requestTutorTurn } from '../services/conversationService'
import { evaluateRealLifeSpeaking } from '../services/realLifeSpeaking'
import { resolveRealLifeRoute } from '../services/realLifeRoute'
import { analyzeTextAnswer } from '../services/answerDiff'
import { shuffle } from '../services/exerciseEngine'

import { useRealLifeProgressStore } from '../stores/realLifeProgress'
import { useSavedExpressionsStore } from '../stores/savedExpressions'
import { useWordProgressStore } from '../stores/wordProgress'
import { usePerformanceStore } from '../stores/performance'
import { useAISettingsStore } from '../stores/aiSettings'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useSessionSettingsStore } from '../stores/sessionSettings'
import { useToastStore } from '../stores/toast'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'
import LearnStage from '../components/learn/LearnStage.vue'
import LearningIllustration from '../components/art/LearningIllustration.vue'
import { itemFromExpression } from '../services/learnItems'
import type { LearnItem } from '../services/learnItems'

import type { Exercise, ExerciseResult } from '../types/exercise'
import type {
    ExpressionHelp,
    RealLifeScenario,
    RealLifeScenarioManifest,
} from '../types/realLife'
import type { ConversationSession } from '../types/conversation'

const route = useRoute()
const router = useRouter()

const progressStore = useRealLifeProgressStore()
const savedExpressionsStore = useSavedExpressionsStore()
const wordProgressStore = useWordProgressStore()
const performanceStore = usePerformanceStore()
const aiSettingsStore = useAISettingsStore()
const learnerProfileStore = useLearnerProfileStore()
const sessionSettingsStore = useSessionSettingsStore()
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

/* ---------- top-level navigation ---------- */

type Tab = 'situations' | 'my-life' | 'quick' | 'saved' | 'progress'

const tab = ref<Tab>('situations')

const scenarios = ref<RealLifeScenarioManifest[]>([])
const loadError = ref('')

/* ---------- scenario flow ---------- */

type Step = 'see' | 'learn' | 'practice' | 'speak' | 'use' | 'done'

const activeManifest = ref<RealLifeScenarioManifest | null>(null)
const activeScenario = ref<RealLifeScenario | null>(null)
const step = ref<Step>('see')
const exerciseIndex = ref(0)
const exerciseResults = ref<ExerciseResult[]>([])

async function openScenario(manifest: RealLifeScenarioManifest, initialStep: Step = 'see') {
    loadError.value = ''

    try {
        activeScenario.value = await loadRealLifeScenario(manifest)
        activeManifest.value = manifest
        step.value = initialStep
        exerciseIndex.value = 0
        exerciseResults.value = []
        progressStore.touch(manifest.id)
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : 'Failed to load scenario'
    }
}

function closeScenario() {
    /* Drop ?scenario/&step so a refresh doesn't reopen what the learner closed. */
    if (route.query.scenario !== undefined || route.query.step !== undefined) {
        const { scenario: _scenario, step: _step, ...rest } = route.query
        void router.replace({ query: rest })
    }

    activeScenario.value = null
    activeManifest.value = null
    roleplayMessages.value = []
    speakRecord.value = null
    resetVoice()
}

function saveExpression(english: string, persian: string) {
    savedExpressionsStore.saveExpression(english, '', persian, null)
}

/* Learn step: same Learn experience as vocabulary lessons; "save" is the existing saved-expressions store. */
const learnItems = computed<LearnItem[]>(() => activeScenario.value?.expressions.map(itemFromExpression) ?? [])

function isExpressionSaved(item: LearnItem): boolean {
    return savedExpressionsStore.expressions.some(saved => saved.expression.toLowerCase() === item.text.trim().toLowerCase())
}

function toggleExpressionSaved(item: LearnItem) {
    if (isExpressionSaved(item)) savedExpressionsStore.removeExpression(item.text.trim())
    else savedExpressionsStore.saveExpression(item.text, '', item.meaning, null)
}

/* ---------- practice step ---------- */

const currentExercise = computed(() =>
    activeScenario.value?.exercises[exerciseIndex.value] ?? null
)

const exerciseAnswered = computed(() => exerciseResults.value.length > exerciseIndex.value)

function onExerciseResult(result: ExerciseResult) {
    exerciseResults.value.push(result)

    performanceStore.record({
        skill: 'vocabulary',
        activityId: result.exerciseId,
        lessonId: activeScenario.value?.id ?? null,
        difficulty: currentExercise.value?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['vocabulary'],
    })
}

function nextExercise() {
    if (!activeScenario.value) return

    if (exerciseIndex.value < activeScenario.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    progressStore.markStep(activeScenario.value.id, 'practice')
    step.value = 'speak'
}

/* ---------- speak step ---------- */

const speakRecord = ref<{ transcript: string; score: number; closest: string } | null>(null)

const speakingEnabled = computed(() => sessionSettingsStore.settings.speakingEnabled)

async function recordSpeaking() {
    const scenario = activeScenario.value

    if (!scenario || isListening.value) return

    resetVoice()
    await startListening()

    if (!transcript.value) return

    /* Compare against the BEST-matching model sentence — transcript match,
     * never phoneme-level pronunciation. */
    const outcome = evaluateRealLifeSpeaking(
        scenario.id,
        scenario.speakingTask.modelSentences,
        transcript.value,
        confidence.value || null
    )

    speakRecord.value = { transcript: transcript.value, score: outcome.score, closest: outcome.closest }

    /* Voice evidence only; correct only when the shared transcript-match
     * threshold (same as Guided Speaking) is met. */
    if (outcome.event) performanceStore.record(outcome.event)
}

const speakDiff = computed(() =>
    speakRecord.value
        ? analyzeTextAnswer([speakRecord.value.closest], speakRecord.value.transcript)
        : null
)

function finishSpeak() {
    if (activeScenario.value) progressStore.markStep(activeScenario.value.id, 'speak')
    step.value = 'use'
}

/* ---------- use step: embedded roleplay (reuses the Conversation Tutor) ---------- */

interface RoleplayMessage {
    role: 'learner' | 'tutor'
    text: string
}

const roleplayMessages = ref<RoleplayMessage[]>([])
const roleplayDraft = ref('')
const roleplayWaiting = ref(false)
const roleplayError = ref('')

function roleplaySessionShape(): ConversationSession {
    /* Ephemeral session object for conversationService — not persisted. */
    return {
        id: `real-life-${activeScenario.value?.id}`,
        mode: 'roleplay',
        scenarioId: null,
        difficulty: learnerProfileStore.profile.selfReportedLevel ?? 'B1',
        feedbackMode: 'gentle',
        startedAt: Date.now(),
        endedAt: null,
        messages: roleplayMessages.value.map((message, index) => ({
            id: `m${index}`,
            role: message.role,
            text: message.text,
            inputMethod: null,
            voiceConfidence: null,
            corrections: [],
            translation: null,
            timestamp: Date.now(),
        })),
        summary: null,
    }
}

function startRoleplay() {
    const scenario = activeScenario.value

    if (!scenario) return

    roleplayMessages.value = [{ role: 'tutor', text: scenario.roleplay.opening }]
    roleplayError.value = ''
}

async function sendRoleplayMessage() {
    const scenario = activeScenario.value
    const text = roleplayDraft.value.trim()

    if (!scenario || !text || roleplayWaiting.value) return

    roleplayMessages.value.push({ role: 'learner', text })
    roleplayDraft.value = ''
    roleplayWaiting.value = true
    roleplayError.value = ''

    try {
        const turn = await requestTutorTurn(roleplaySessionShape(), {
            id: `real-life-${scenario.id}`,
            title: scenario.title,
            mode: 'roleplay',
            aiRole: scenario.roleplay.aiRole,
            learnerRole: scenario.roleplay.learnerRole,
            objective: scenario.roleplay.objective,
            context: scenario.roleplay.context,
            vocabulary: scenario.roleplay.vocabulary,
            opening: scenario.roleplay.opening,
        })

        roleplayMessages.value.push({ role: 'tutor', text: turn.reply })

        if (roleplayMessages.value.filter(message => message.role === 'learner').length >= 3) {
            progressStore.markStep(scenario.id, 'roleplay')
        }
    } catch (err) {
        roleplayError.value = err instanceof AIClientError
            ? `${err.message} Your messages are still here — retry.`
            : 'Roleplay request failed. Your messages are still here.'
    } finally {
        roleplayWaiting.value = false
    }
}

/* ---------- learn step completion ---------- */

function finishLearn() {
    if (activeScenario.value) progressStore.markStep(activeScenario.value.id, 'learn')
    step.value = 'practice'
}

/* ---------- My Real Life ---------- */

const myLifeInput = ref('')
const myLifeResult = ref<ExpressionHelp | null>(null)
const myLifeLoading = ref(false)
const myLifeError = ref('')
const myLifePracticeIndex = ref<number | null>(null)

async function expressMyLife() {
    const input = myLifeInput.value.trim()

    if (!input || myLifeLoading.value) return

    if (!aiSettingsStore.settings.enabled) {
        toastStore.push('AI is disabled in AI Settings — My Real Life needs it.', 'error')
        return
    }

    myLifeLoading.value = true
    myLifeError.value = ''
    myLifeResult.value = null
    myLifePracticeIndex.value = null

    try {
        const response = await expressInEnglish({
            input,
            provider: aiSettingsStore.settings.provider,
            model: aiSettingsStore.settings.model || undefined,
            allowFallback: aiSettingsStore.settings.allowFallback,
            learner: { selfReportedLevel: learnerProfileStore.profile.selfReportedLevel ?? '' },
        })

        myLifeResult.value = {
            input,
            ...response.expression,
            provider: response.meta.provider,
            model: response.meta.model,
            generatedAt: Date.now(),
        }
    } catch (err) {
        myLifeError.value = err instanceof AIClientError
            ? err.message
            : 'Request failed — your text is still in the box.'
    } finally {
        myLifeLoading.value = false
    }
}

const myLifeExercises = computed<Exercise[]>(() =>
    (myLifeResult.value?.followUpExercises ?? []).map((item, index) => {
        const id = `my-life-${myLifeResult.value!.generatedAt}-${index}`

        if (item.type === 'grammar-correction') {
            return { id, type: 'grammar-correction', skill: 'vocabulary', incorrectSentence: item.prompt, acceptedAnswers: item.acceptedAnswers, explanation: item.explanation }
        }

        if (item.type === 'fill-blank') {
            const gap = item.prompt.indexOf('___')
            return {
                id, type: 'fill-blank', skill: 'vocabulary',
                before: gap === -1 ? item.prompt : item.prompt.slice(0, gap).trim(),
                after: gap === -1 ? '' : item.prompt.slice(gap + 3).trim(),
                acceptedAnswers: item.acceptedAnswers, explanation: item.explanation,
            }
        }

        return { id, type: 'short-answer', skill: 'vocabulary', prompt: item.prompt, acceptedAnswers: item.acceptedAnswers, explanation: item.explanation }
    })
)

/* ---------- Quick Practice ---------- */

const quickExercises = ref<Exercise[]>([])
const quickIndex = ref(0)
const quickResults = ref<ExerciseResult[]>([])
const quickLoading = ref(false)

async function startQuickPractice() {
    quickLoading.value = true
    quickResults.value = []
    quickIndex.value = 0

    try {
        const picks = shuffle(scenarios.value).slice(0, 3)
        const loaded = await Promise.all(picks.map(loadRealLifeScenario))
        quickExercises.value = shuffle(loaded.flatMap(scenario => scenario.exercises)).slice(0, 5)
    } catch {
        toastStore.push('Could not load quick practice content.', 'error')
        quickExercises.value = []
    } finally {
        quickLoading.value = false
    }
}

/* ---------- Saved expressions review (existing SRS) ---------- */

const reviewing = ref(false)
const reviewQueue = ref<string[]>([])
const reviewIndex = ref(0)
const reviewRevealed = ref(false)

const dueExpressions = computed(() => {
    const expressionSet = new Set(
        savedExpressionsStore.expressions.map(item => item.expression.toLowerCase())
    )

    return wordProgressStore.progress
        .filter(item => expressionSet.has(item.wordId))
        .filter(item => item.nextReviewAt === null || item.nextReviewAt <= Date.now())
        .map(item => item.wordId)
})

function startReview() {
    /* New saved expressions may not be in SRS yet — include them as due. */
    const tracked = new Set(wordProgressStore.progress.map(item => item.wordId))
    const fresh = savedExpressionsStore.expressions
        .map(item => item.expression)
        .filter(expression => !tracked.has(expression.toLowerCase()))

    reviewQueue.value = [...new Set([...dueExpressions.value, ...fresh.map(e => e.toLowerCase())])]
    reviewIndex.value = 0
    reviewRevealed.value = false
    reviewing.value = reviewQueue.value.length > 0

    if (!reviewing.value) toastStore.push('Nothing due for review right now.', 'info')
}

const reviewCurrent = computed(() => {
    const key = reviewQueue.value[reviewIndex.value]

    return savedExpressionsStore.expressions.find(
        item => item.expression.toLowerCase() === key
    ) ?? null
})

function reviewAnswer(correct: boolean) {
    const current = reviewCurrent.value

    if (!current) return

    /* Rides the EXISTING SM-2 SRS — no parallel scheduler. */
    if (correct) wordProgressStore.recordCorrect(current.expression)
    else wordProgressStore.recordWrong(current.expression)

    reviewRevealed.value = false

    if (reviewIndex.value < reviewQueue.value.length - 1) {
        reviewIndex.value++
    } else {
        reviewing.value = false
        toastStore.push('Review done — next reviews scheduled.', 'success')
    }
}

/* Deep links (Daily Journey, refresh, shared URL): ?scenario=<id>&step=<step>.
 * Validated against the real manifest; anything invalid falls back to the home view. */
async function applyRouteQuery() {
    if (!scenarios.value.length) return

    const target = resolveRealLifeRoute(route.query, scenarios.value.map(item => item.id))

    if (!target || activeManifest.value?.id === target.scenarioId) {
        if (target && activeManifest.value?.id === target.scenarioId) step.value = target.step
        return
    }

    const manifest = scenarios.value.find(item => item.id === target.scenarioId)

    if (manifest) await openScenario(manifest, target.step)
}

onMounted(async () => {
    try {
        scenarios.value = await loadRealLifeManifest()
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : 'Failed to load scenarios'
        return
    }

    await applyRouteQuery()
})

watch(() => [route.query.scenario, route.query.step], () => { void applyRouteQuery() })
</script>

<template>
    <div class="mx-auto max-w-3xl">
        <p v-if="loadError" class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {{ loadError }}
        </p>

        <!-- ==================== SCENARIO FLOW ==================== -->
        <template v-if="activeScenario">
            <div class="mb-4 flex items-center justify-between gap-3">
                <button type="button" class="btn-ghost -ml-3" @click="closeScenario">
                    ← Real-Life English
                </button>
                <span class="shrink-0 text-xs text-gray-400">{{ activeManifest?.cefrLevel }}</span>
            </div>

            <!-- Step nav -->
            <div class="mb-6 flex gap-1 overflow-x-auto text-xs">
                <button
                    v-for="(label, key) in { see: 'See', learn: 'Learn', practice: 'Practice', speak: 'Speak', use: 'Use' }"
                    :key="key"
                    type="button"
                    class="shrink-0 rounded-full px-3 py-1.5 transition"
                    :class="step === key
                        ? (key === 'see' || key === 'learn' ? 'bg-learn-600 text-white' : 'bg-practice-600 text-white')
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
                    @click="step = key as Step"
                >
                    {{ label }}
                </button>
            </div>

            <!-- SEE -->
            <div v-if="step === 'see'" class="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <div class="mx-auto aspect-[16/9] w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200">
                    <LearningIllustration :scene="activeScenario.id" :seed="activeScenario.id" :label="activeScenario.title" />
                </div>
                <h1 class="mt-5">{{ activeScenario.title }}</h1>
                <p class="text-gray-500" dir="rtl">{{ activeScenario.titlePersian }}</p>

                <p class="mx-auto mt-5 max-w-md text-gray-700">{{ activeScenario.context }}</p>
                <p class="mx-auto mt-3 max-w-md rounded-xl bg-gray-50 p-3 text-sm text-gray-600" dir="rtl">
                    {{ activeScenario.contextPersian }}
                </p>

                <button type="button" class="btn-primary btn-lg mt-6" @click="step = 'learn'">
                    Learn the expressions ({{ activeScenario.expressions.length }})
                </button>
            </div>

            <!-- LEARN: the shared Learn experience (explanations first, everything visible) -->
            <LearnStage
                v-else-if="step === 'learn'"
                :items="learnItems"
                :title="activeScenario.title"
                :subtitle="activeScenario.titlePersian"
                :meta="[activeManifest?.cefrLevel ?? '', `${learnItems.length} expressions`].filter(Boolean)"
                :scene="activeScenario.id"
                :seed="activeScenario.id"
                hide-back
                framed
                :is-saved="isExpressionSaved"
                save-label="saved expressions"
                :actions="[{ key: 'practice', label: 'Continue to Practice', primary: true }]"
                finish-label="Finish"
                @save="toggleExpressionSaved"
                @action="finishLearn"
            />

            <!-- PRACTICE -->
            <div data-mode="practice" v-else-if="step === 'practice' && currentExercise">
                <div class="mb-4 flex items-center justify-between text-sm">
                    <span class="rounded-full bg-practice-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-practice-700">Practice</span>
                    <span class="tabular-nums text-ink-soft">{{ exerciseIndex + 1 }} / {{ activeScenario.exercises.length }}</span>
                </div>

                <div class="rounded-3xl border border-work-line bg-work p-5 shadow-soft sm:p-6">
                    <ExercisePlayer :key="currentExercise.id" :exercise="currentExercise" @result="onExerciseResult" />

                    <button
                        v-if="exerciseAnswered"
                        type="button"
                        class="mt-6 min-h-12 w-full rounded-2xl bg-practice-600 px-4 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40"
                        @click="nextExercise"
                    >
                        {{ exerciseIndex === activeScenario.exercises.length - 1 ? 'Continue to speaking' : 'Next' }}
                    </button>
                </div>
            </div>

            <!-- SPEAK -->
            <div data-mode="practice" v-else-if="step === 'speak'" class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="font-semibold text-gray-900">Say it out loud</h2>
                <p class="mt-2 text-gray-700">{{ activeScenario.speakingTask.instruction }}</p>
                <p class="mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-600" dir="rtl">
                    {{ activeScenario.speakingTask.instructionPersian }}
                </p>

                <div class="mt-4 space-y-1.5">
                    <p v-for="sentence in activeScenario.speakingTask.modelSentences" :key="sentence" class="text-sm text-gray-600">
                        • {{ sentence }} <SpeechButton :text="sentence" lang="en-US" />
                    </p>
                </div>

                <div v-if="!speakingEnabled" class="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                    Speaking practice is turned off in your settings — read the sentences aloud on your own, then continue.
                </div>

                <template v-else>
                    <div class="mt-5 text-center">
                        <button
                            v-if="!isListening"
                            type="button"
                            class="rounded-full bg-accent px-8 py-3 text-white hover:bg-accent-strong disabled:opacity-50"
                            :disabled="!voiceSupported"
                            @click="recordSpeaking"
                        >
                            Speak
                        </button>
                        <div v-else class="inline-block rounded-lg bg-gray-100 px-8 py-3 text-gray-600">Listening…</div>
                        <p v-if="!voiceSupported" class="mt-2 text-xs text-red-500">Speech recognition is not supported in this browser.</p>
                        <p v-if="voiceError" class="mt-2 text-xs text-red-500">{{ voiceError }}</p>
                    </div>

                    <div v-if="speakRecord" class="mt-4 rounded-xl bg-gray-50 p-4">
                        <p class="text-xs text-gray-500">You said:</p>
                        <p class="font-medium text-gray-900">{{ speakRecord.transcript }}</p>
                        <p class="mt-1 text-xs text-gray-400">
                            Closest model sentence match: {{ speakRecord.score }}%
                            (transcript similarity — not pronunciation scoring)
                        </p>
                        <div v-if="speakDiff && speakDiff.corrections.length && speakDiff.matchRatio >= 0.5" class="mt-2 text-sm text-gray-600">
                            <span class="text-xs text-gray-500">vs "{{ speakDiff.closestAccepted }}": </span>
                            <span v-for="(op, i) in speakDiff.corrections" :key="i" class="mr-2">
                                <template v-if="op.type === 'replace'"><s class="text-red-500">{{ op.learner }}</s> → <b class="text-green-700">{{ op.expected }}</b></template>
                            </span>
                        </div>
                    </div>
                </template>

                <button type="button" class="btn-primary btn-lg mt-6 w-full" @click="finishSpeak">
                    Continue to roleplay →
                </button>
            </div>

            <!-- USE: embedded roleplay -->
            <div data-mode="practice" v-else-if="step === 'use'" class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="font-semibold text-gray-900">💬 Use it: {{ activeScenario.roleplay.objective }}</h2>
                <p class="mt-1 text-sm text-gray-500">
                    You: {{ activeScenario.roleplay.learnerRole }} · AI: {{ activeScenario.roleplay.aiRole }}
                </p>

                <button
                    v-if="!roleplayMessages.length"
                    type="button"
                    class="btn-primary btn-lg mt-4 w-full"
                    @click="startRoleplay"
                >
                    Start roleplay
                </button>

                <template v-else>
                    <div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
                        <div
                            v-for="(message, index) in roleplayMessages"
                            :key="index"
                            class="flex"
                            :class="message.role === 'learner' ? 'justify-end' : 'justify-start'"
                        >
                            <div
                                class="max-w-[85%] rounded-2xl px-3 py-2 text-sm"
                                :class="message.role === 'learner' ? 'bg-accent text-white' : 'bg-gray-100 text-gray-800'"
                            >
                                {{ message.text }}
                                <SpeechButton v-if="message.role === 'tutor'" :text="message.text" lang="en-US" />
                            </div>
                        </div>
                        <p v-if="roleplayWaiting" class="text-sm text-gray-400">thinking…</p>
                        <p v-if="roleplayError" class="rounded-lg bg-amber-50 p-2 text-sm text-amber-700">{{ roleplayError }}</p>
                    </div>

                    <div class="mt-3 flex gap-2">
                        <input
                            v-model="roleplayDraft"
                            dir="auto"
                            placeholder="Reply in English…"
                            class="field min-w-0 flex-1"
                            :disabled="roleplayWaiting"
                            @keydown.enter.prevent="sendRoleplayMessage"
                        />
                        <button
                            type="button"
                            class="btn-primary shrink-0"
                            :disabled="!roleplayDraft.trim() || roleplayWaiting"
                            @click="sendRoleplayMessage"
                        >
                            Send
                        </button>
                    </div>
                </template>

                <button type="button" class="mt-5 w-full rounded-xl border px-4 py-3 text-gray-600 hover:bg-gray-100" @click="step = 'done'">
                    Finish scenario
                </button>
            </div>

            <!-- DONE -->
            <div data-mode="practice" v-else-if="step === 'done'" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
                <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><AppIcon name="check" :size="26" /></span>
                <h2 class="mt-4 text-2xl font-bold">{{ activeScenario.title }} — done</h2>
                <p class="mt-2 text-sm text-gray-500">
                    {{ progressStore.stepCount(activeScenario.id) }} / 4 steps completed.
                    Saved expressions are waiting in your review queue.
                </p>
                <button type="button" class="btn-primary btn-lg mt-6" @click="closeScenario">
                    Back to scenarios
                </button>
            </div>
        </template>

        <!-- ==================== HOME ==================== -->
        <template v-else>
            <div class="mb-6">
                <h1>Real-Life English</h1>
                <p class="mt-2 text-gray-500">
                    Say everyday things the way people actually say them.
                    <span dir="rtl" class="block text-sm">انگلیسی را همان‌طور که در زندگی واقعی استفاده می‌شود یاد بگیر.</span>
                </p>
            </div>

            <div class="mb-6 flex gap-1 overflow-x-auto text-sm">
                <button
                    v-for="(label, key) in { situations: 'Daily Situations', 'my-life': 'My Real Life', quick: 'Quick Practice', saved: 'Saved', progress: 'Progress' }"
                    :key="key"
                    type="button"
                    class="shrink-0 rounded-full px-4 py-2 transition"
                    :class="tab === key ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                    @click="tab = key as Tab"
                >
                    {{ label }}
                </button>
            </div>

            <!-- SITUATIONS -->
            <div v-if="tab === 'situations'" class="grid gap-3 sm:grid-cols-2">
                <button
                    v-for="scenario in scenarios"
                    :key="scenario.id"
                    type="button"
                    class="overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/30"
                    @click="openScenario(scenario)"
                >
                    <div class="aspect-[16/9] w-full overflow-hidden" aria-hidden="true">
                        <LearningIllustration :scene="scenario.id || scenario.category" :seed="scenario.id" />
                    </div>
                    <div class="p-4">
                        <div class="flex items-start justify-between gap-2">
                            <p class="font-semibold text-gray-900">{{ scenario.title }}</p>
                            <span class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{{ scenario.cefrLevel }}</span>
                        </div>
                        <p class="text-sm text-gray-500" dir="rtl">{{ scenario.titlePersian }}</p>
                        <p class="mt-1 text-xs text-gray-400">
                            ~{{ scenario.estimatedDuration }} min
                            <span v-if="progressStore.stepCount(scenario.id)"> · {{ progressStore.stepCount(scenario.id) }}/4 steps</span>
                        </p>
                    </div>
                </button>
            </div>

            <!-- MY REAL LIFE -->
            <div v-else-if="tab === 'my-life'">
                <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 class="font-semibold text-gray-900">What are you doing right now?</h2>
                    <p class="mt-1 text-sm text-gray-500" dir="rtl">
                        به فارسی یا انگلیسی بنویس چه کاری می‌کنی یا می‌خواهی بگویی — نشانت می‌دهیم به انگلیسی طبیعی چطور گفته می‌شود.
                    </p>

                    <div class="mt-3 flex gap-2">
                        <input
                            v-model="myLifeInput"
                            dir="auto"
                            placeholder="مثلاً: دارم چای درست می‌کنم / I am making tea"
                            class="field min-w-0 flex-1"
                            :disabled="myLifeLoading"
                            @keydown.enter.prevent="expressMyLife"
                        />
                        <button
                            type="button"
                            class="btn-primary btn-lg shrink-0"
                            :disabled="!myLifeInput.trim() || myLifeLoading"
                            @click="expressMyLife"
                        >
                            {{ myLifeLoading ? '…' : 'Help me say it' }}
                        </button>
                    </div>

                    <p v-if="myLifeError" class="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">{{ myLifeError }}</p>
                </div>

                <div v-if="myLifeResult" class="mt-4 space-y-3">
                    <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p class="text-xs text-gray-400">
                            {{ myLifeResult.provider }} · {{ myLifeResult.model }} — AI suggestion, check the note if unsure
                        </p>

                        <div class="mt-3 space-y-3">
                            <div v-if="myLifeResult.literal">
                                <p class="text-xs text-gray-500">Literal (word-for-word — may sound unnatural)</p>
                                <p class="text-gray-600">{{ myLifeResult.literal }}</p>
                            </div>

                            <div class="rounded-xl bg-green-50 p-3">
                                <p class="text-xs text-green-700">✓ Natural everyday English</p>
                                <p class="font-semibold text-gray-900">
                                    {{ myLifeResult.natural }}
                                    <SpeechButton :text="myLifeResult.natural" lang="en-US" />
                                </p>
                                <p class="text-sm text-gray-600" dir="rtl">{{ myLifeResult.naturalPersian }}</p>
                                <button
                                    type="button"
                                    class="mt-2 rounded-lg border px-2 py-1 text-xs text-gray-600 hover:bg-white"
                                    @click="saveExpression(myLifeResult.natural, myLifeResult.naturalPersian)"
                                >
                                    ☆ Save this
                                </button>
                            </div>

                            <div v-if="myLifeResult.advanced">
                                <p class="text-xs text-gray-500">More advanced / alternative</p>
                                <p class="text-gray-800">
                                    {{ myLifeResult.advanced }}
                                    <SpeechButton :text="myLifeResult.advanced" lang="en-US" />
                                </p>
                                <p class="text-sm text-gray-500" dir="rtl">{{ myLifeResult.advancedPersian }}</p>
                            </div>
                        </div>
                    </div>

                    <div v-if="myLifeResult.vocabulary.length" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Key words</p>
                        <div v-for="item in myLifeResult.vocabulary" :key="item.english" class="mt-1.5 flex items-baseline justify-between gap-3 text-sm">
                            <span class="font-medium text-gray-900">{{ item.english }} <SpeechButton :text="item.english" lang="en-US" /></span>
                            <span class="text-gray-500" dir="rtl">{{ item.persian }}</span>
                        </div>
                    </div>

                    <div v-if="myLifeResult.relatedExamples.length" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">You could also say</p>
                        <div v-for="item in myLifeResult.relatedExamples" :key="item.english" class="mt-2 text-sm">
                            <p class="text-gray-800">{{ item.english }} <SpeechButton :text="item.english" lang="en-US" /></p>
                            <p class="text-gray-500" dir="rtl">{{ item.persian }}</p>
                        </div>
                    </div>

                    <div v-if="myLifeExercises.length" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Quick check</p>
                        <button
                            v-if="myLifePracticeIndex === null"
                            type="button"
                            class="btn-primary mt-2"
                            @click="myLifePracticeIndex = 0"
                        >
                            Practice it ({{ myLifeExercises.length }})
                        </button>
                        <div v-else-if="myLifePracticeIndex < myLifeExercises.length" class="mt-3">
                            <ExercisePlayer
                                :key="myLifeExercises[myLifePracticeIndex].id"
                                :exercise="myLifeExercises[myLifePracticeIndex]"
                                @result="() => {}"
                            />
                            <button type="button" class="btn-primary mt-3" @click="myLifePracticeIndex!++">
                                {{ myLifePracticeIndex === myLifeExercises.length - 1 ? 'Done' : 'Next' }}
                            </button>
                        </div>
                        <p v-else class="mt-2 text-sm text-green-700">Done.</p>
                    </div>
                </div>
            </div>

            <!-- QUICK PRACTICE -->
            <div data-mode="practice" v-else-if="tab === 'quick'">
                <div v-if="!quickExercises.length" class="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                    <p class="text-gray-600">Five random exercises from everyday scenarios — about 3 minutes.</p>
                    <button
                        type="button"
                        class="btn-primary btn-lg mt-4"
                        :disabled="quickLoading || !scenarios.length"
                        @click="startQuickPractice"
                    >
                        {{ quickLoading ? 'Loading…' : 'Start quick practice' }}
                    </button>
                </div>

                <div v-else-if="quickIndex < quickExercises.length">
                    <div class="mb-3 flex justify-between text-sm text-gray-500">
                        <span>Quick practice</span>
                        <span>{{ quickIndex + 1 }} / {{ quickExercises.length }}</span>
                    </div>
                    <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                        <ExercisePlayer
                            :key="quickExercises[quickIndex].id"
                            :exercise="quickExercises[quickIndex]"
                            @result="result => quickResults.push(result)"
                        />
                        <button
                            v-if="quickResults.length > quickIndex"
                            type="button"
                            class="btn-primary btn-lg mt-6 w-full"
                            @click="quickIndex++"
                        >
                            {{ quickIndex === quickExercises.length - 1 ? 'Finish' : 'Next' }}
                        </button>
                    </div>
                </div>

                <div v-else class="rounded-2xl border bg-white p-8 text-center shadow-sm">
                    <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><AppIcon name="sparkle" :size="26" /></span>
                    <p class="mt-3 text-xl font-bold">{{ quickResults.filter(r => r.correct).length }} / {{ quickResults.length }}</p>
                    <button type="button" class="btn-primary btn-lg mt-4" @click="quickExercises = []">
                        Again
                    </button>
                </div>
            </div>

            <!-- SAVED -->
            <div v-else-if="tab === 'saved'">
                <div v-if="reviewing && reviewCurrent" class="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                    <p class="text-xs text-gray-400">{{ reviewIndex + 1 }} / {{ reviewQueue.length }}</p>
                    <p class="mt-4 text-lg text-gray-700" dir="rtl">{{ reviewCurrent.meaningPersian || reviewCurrent.meaning || '—' }}</p>

                    <template v-if="!reviewRevealed">
                        <button type="button" class="btn-primary btn-lg mt-6" @click="reviewRevealed = true">
                            Show English
                        </button>
                    </template>
                    <template v-else>
                        <p class="mt-4 text-xl font-bold text-gray-900">
                            {{ reviewCurrent.expression }}
                            <SpeechButton :text="reviewCurrent.expression" lang="en-US" />
                        </p>
                        <div class="mt-6 flex justify-center gap-3">
                            <button type="button" class="rounded-xl border border-red-200 px-6 py-3 text-red-600 hover:bg-red-50" @click="reviewAnswer(false)">
                                Didn't know
                            </button>
                            <button type="button" class="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700" @click="reviewAnswer(true)">
                                Knew it
                            </button>
                        </div>
                    </template>
                </div>

                <template v-else>
                    <div class="mb-4 flex items-center justify-between">
                        <p class="text-sm text-gray-500">
                            {{ savedExpressionsStore.expressions.length }} saved
                            <span v-if="dueExpressions.length"> · {{ dueExpressions.length }} due</span>
                        </p>
                        <button
                            type="button"
                            class="btn-primary"
                            :disabled="!savedExpressionsStore.expressions.length"
                            @click="startReview"
                        >
                            Review
                        </button>
                    </div>

                    <div class="space-y-2">
                        <div
                            v-for="item in savedExpressionsStore.expressions"
                            :key="item.expression"
                            class="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
                        >
                            <div class="min-w-0">
                                <p class="font-medium text-gray-900">{{ item.expression }} <SpeechButton :text="item.expression" lang="en-US" /></p>
                                <p v-if="item.meaningPersian" class="text-gray-500" dir="rtl">{{ item.meaningPersian }}</p>
                            </div>
                            <button type="button" class="shrink-0 text-xs text-red-400 hover:text-red-600" @click="savedExpressionsStore.removeExpression(item.expression)">
                                Remove
                            </button>
                        </div>
                        <p v-if="!savedExpressionsStore.expressions.length" class="py-8 text-center text-sm text-gray-400">
                            Save expressions from scenarios, conversations or My Real Life — they land here for spaced review.
                        </p>
                    </div>
                </template>
            </div>

            <!-- PROGRESS -->
            <div v-else-if="tab === 'progress'" class="space-y-3">
                <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p class="text-sm text-gray-500">Scenarios completed</p>
                    <p class="mt-1 text-3xl font-bold text-gray-900">{{ progressStore.completedCount }} / {{ scenarios.length }}</p>
                </div>
                <div
                    v-for="scenario in scenarios"
                    :key="scenario.id"
                    class="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm"
                >
                    <span class="min-w-0 truncate">{{ scenario.icon }} {{ scenario.title }}</span>
                    <span class="shrink-0 text-gray-400">{{ progressStore.stepCount(scenario.id) }}/4</span>
                </div>
            </div>
        </template>
    </div>
</template>
