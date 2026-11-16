<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadCareerManifest, loadCareerSection } from '../services/careerContent'
import { AIClientError, evaluateInterviewAnswer } from '../services/aiClient'
import type { InterviewAnswerEvaluation } from '../services/aiClient'
import { evidenceForInterviewAnswer, hasContentWeakness } from '../services/careerEvidence'
import { requestTutorTurn } from '../services/conversationService'

import { useSavedAnswersStore, STAR_KEYS, isStarComplete, missingStarParts } from '../stores/savedAnswers'
import { useInterviewHistoryStore } from '../stores/interviewHistory'
import { usePerformanceStore } from '../stores/performance'
import { useAISettingsStore } from '../stores/aiSettings'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useSessionSettingsStore } from '../stores/sessionSettings'
import { useSavedExpressionsStore } from '../stores/savedExpressions'
import { useToastStore } from '../stores/toast'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import SpeechButton from '../components/ui/SpeechButton.vue'

import type {
    BehavioralScenario,
    CareerSectionContent,
    CareerSectionManifest,
    InterviewQuestion,
    SavedAnswer,
    WorkplaceDialogue,
} from '../types/career'
import type { ConversationSession } from '../types/conversation'

const savedAnswersStore = useSavedAnswersStore()
const historyStore = useInterviewHistoryStore()
const performanceStore = usePerformanceStore()
const aiSettingsStore = useAISettingsStore()
const learnerProfileStore = useLearnerProfileStore()
const sessionSettingsStore = useSessionSettingsStore()
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

type Tab = 'sections' | 'mock' | 'saved' | 'progress'

const tab = ref<Tab>('sections')

const sections = ref<CareerSectionManifest[]>([])
const loadError = ref('')

const activeSection = ref<CareerSectionManifest | null>(null)
const content = ref<CareerSectionContent | null>(null)

const speakingEnabled = computed(() => sessionSettingsStore.settings.speakingEnabled)

async function openSection(section: CareerSectionManifest) {
    loadError.value = ''

    try {
        content.value = await loadCareerSection(section)
        activeSection.value = section
        closeItem()
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : 'Failed to load section'
    }
}

/* ---------- item practice (question / scenario / dialogue) ---------- */

const activeQuestion = ref<InterviewQuestion | null>(null)
const activeScenario = ref<BehavioralScenario | null>(null)
const activeDialogue = ref<WorkplaceDialogue | null>(null)

const showModel = ref(false)
const answerDraft = ref('')
const answerFromVoice = ref(false)
const answerConfidence = ref<number | null>(null)
const evaluating = ref(false)
const evaluationError = ref('')
const evaluation = ref<InterviewAnswerEvaluation | null>(null)

/* behavioral: working answer being built */
const workingAnswer = ref<SavedAnswer | null>(null)

function closeItem() {
    activeQuestion.value = null
    activeScenario.value = null
    activeDialogue.value = null
    showModel.value = false
    answerDraft.value = ''
    answerFromVoice.value = false
    evaluation.value = null
    evaluationError.value = ''
    workingAnswer.value = null
    resetVoice()
}

function openQuestion(question: InterviewQuestion) {
    closeItem()
    activeQuestion.value = question
}

function openScenario(scenario: BehavioralScenario) {
    closeItem()
    activeScenario.value = scenario
    /* Continue an existing draft for this scenario, else start a new one. */
    workingAnswer.value =
        savedAnswersStore.forSource(scenario.id)[0] ?? savedAnswersStore.create(scenario.id, scenario.title)
}

function openDialogue(dialogue: WorkplaceDialogue) {
    closeItem()
    activeDialogue.value = dialogue
}

const currentPromptText = computed(
    () => activeQuestion.value?.question ?? activeScenario.value?.prompt ?? ''
)

const currentItemId = computed(
    () => activeQuestion.value?.id ?? activeScenario.value?.id ?? ''
)

async function recordAnswerVoice() {
    if (!voiceSupported || isListening.value) return

    resetVoice()
    await startListening()

    if (transcript.value) {
        /* Editable before evaluation — recognizers make mistakes. */
        answerDraft.value = transcript.value
        answerFromVoice.value = true
        answerConfidence.value = confidence.value || null
    }
}

function textToEvaluate(): string {
    if (workingAnswer.value) {
        return workingAnswer.value.finalAnswer.trim()
    }

    return answerDraft.value.trim()
}

async function evaluateCurrent() {
    const answer = textToEvaluate()

    if (!answer || evaluating.value) return

    if (!aiSettingsStore.settings.enabled) {
        toastStore.push('AI is disabled in AI Settings — evaluation needs it.', 'error')
        return
    }

    evaluating.value = true
    evaluationError.value = ''
    evaluation.value = null

    const mode = answerFromVoice.value ? 'voice' as const : 'text' as const

    /* The attempt (original answer) is saved BEFORE the AI call so a
     * provider failure can never lose what the learner wrote. */
    const attempt = historyStore.addAttempt({
        questionId: currentItemId.value,
        question: currentPromptText.value,
        answer,
        answerMode: mode,
        mockSessionId: null,
    })

    try {
        const response = await evaluateInterviewAnswer({
            question: currentPromptText.value,
            answer,
            answerMode: mode,
            explanationLanguage: learnerProfileStore.profile.explanationLanguage,
            provider: aiSettingsStore.settings.provider,
            model: aiSettingsStore.settings.model || undefined,
            allowFallback: aiSettingsStore.settings.allowFallback,
            learner: { selfReportedLevel: learnerProfileStore.profile.selfReportedLevel ?? '' },
        })

        evaluation.value = response.evaluation
        historyStore.setEvaluation(attempt.id, response.evaluation)

        for (const event of evidenceForInterviewAnswer({
            questionId: currentItemId.value,
            answerMode: mode,
            voiceConfidence: answerFromVoice.value ? answerConfidence.value : null,
            evaluation: response.evaluation,
        })) {
            performanceStore.record(event)
        }
    } catch (err) {
        evaluationError.value = err instanceof AIClientError
            ? `${err.message} Your answer is saved — retry anytime.`
            : 'Evaluation failed. Your answer is saved.'
    } finally {
        evaluating.value = false
    }
}

function updateStar(key: typeof STAR_KEYS[number], value: string) {
    if (!workingAnswer.value) return
    savedAnswersStore.update(workingAnswer.value.id, { star: { ...workingAnswer.value.star, [key]: value } })
}

const starMissing = computed(() =>
    workingAnswer.value ? missingStarParts(workingAnswer.value.star) : []
)

function saveVocabulary(english: string, persian: string) {
    savedExpressionsStore.saveExpression(english, '', persian, null)
}

/* ---------- mock interview (reuses the Conversation Tutor, interview mode) ---------- */

interface MockMessage {
    role: 'learner' | 'tutor'
    text: string
    voice?: boolean
}

const mockMessages = ref<MockMessage[]>([])
const mockDraft = ref('')
const mockFromVoice = ref(false)
const mockConfidence = ref<number | null>(null)
const mockWaiting = ref(false)
const mockError = ref('')
const mockSessionId = ref<string | null>(null)

function mockSessionShape(): ConversationSession {
    return {
        id: mockSessionId.value ?? 'mock',
        mode: 'interview',
        scenarioId: null,
        difficulty: learnerProfileStore.profile.selfReportedLevel ?? 'B1',
        feedbackMode: 'natural',
        startedAt: Date.now(),
        endedAt: null,
        messages: mockMessages.value.map((message, index) => ({
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

async function startMock() {
    if (!aiSettingsStore.settings.enabled) {
        toastStore.push('AI is disabled in AI Settings — the mock interview needs it.', 'error')
        return
    }

    mockSessionId.value = `mock-${Date.now()}`
    mockMessages.value = []
    mockError.value = ''
    mockWaiting.value = true

    try {
        /* Seed turn (not stored): ask the interviewer to open. */
        const seeded = mockSessionShape()
        seeded.messages = [{
            id: 'seed', role: 'learner',
            text: "Hello, I'm ready for the interview. Please begin with your first question.",
            inputMethod: null, voiceConfidence: null, corrections: [], translation: null, timestamp: Date.now(),
        }]

        const turn = await requestTutorTurn(seeded, null)
        mockMessages.value.push({ role: 'tutor', text: turn.reply })
    } catch (err) {
        mockError.value = err instanceof AIClientError ? err.message : 'Could not start the interview.'
        mockSessionId.value = null
    } finally {
        mockWaiting.value = false
    }
}

async function recordMockVoice() {
    if (!voiceSupported || isListening.value) return

    resetVoice()
    await startListening()

    if (transcript.value) {
        mockDraft.value = transcript.value
        mockFromVoice.value = true
        mockConfidence.value = confidence.value || null
    }
}

async function sendMock() {
    const text = mockDraft.value.trim()

    if (!text || mockWaiting.value || !mockSessionId.value) return

    const lastQuestion = [...mockMessages.value].reverse().find(message => message.role === 'tutor')?.text ?? ''
    const mode = mockFromVoice.value ? 'voice' as const : 'text' as const
    const confidenceValue = mockFromVoice.value ? mockConfidence.value : null

    mockMessages.value.push({ role: 'learner', text, voice: mockFromVoice.value })

    historyStore.addAttempt({
        questionId: `mock-${mockSessionId.value}`,
        question: lastQuestion,
        answer: text,
        answerMode: mode,
        mockSessionId: mockSessionId.value,
    })

    /* Speaking evidence only for spoken answers. */
    if (mode === 'voice') {
        performanceStore.record({
            skill: 'speaking',
            activityId: 'career-mock-interview',
            lessonId: mockSessionId.value,
            result: 'correct',
            confidence: confidenceValue,
        })
    }

    mockDraft.value = ''
    mockFromVoice.value = false
    mockWaiting.value = true
    mockError.value = ''

    try {
        const turn = await requestTutorTurn(mockSessionShape(), null)
        mockMessages.value.push({ role: 'tutor', text: turn.reply })
    } catch (err) {
        mockError.value = err instanceof AIClientError
            ? `${err.message} Your answer is saved above — retry by sending again.`
            : 'Request failed. Your answer is saved above.'
    } finally {
        mockWaiting.value = false
    }
}

function endMock() {
    mockMessages.value = []
    mockSessionId.value = null
    mockError.value = ''
}

/* ---------- saved answers & progress ---------- */

const progressSummary = computed(() => {
    const attempts = historyStore.attempts

    return {
        attempts: attempts.length,
        evaluated: attempts.filter(item => item.evaluation).length,
        voice: attempts.filter(item => item.answerMode === 'voice').length,
        withContentTips: attempts.filter(item => item.evaluation && hasContentWeakness(item.evaluation)).length,
        savedAnswers: savedAnswersStore.answers.length,
    }
})

const SECTION_ITEMS = computed(() => content.value)

onMounted(async () => {
    try {
        sections.value = await loadCareerManifest()
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : 'Failed to load Career English'
    }
})
</script>

<template>
    <div class="mx-auto max-w-3xl">
        <p v-if="loadError" class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{{ loadError }}</p>

        <!-- ================= ITEM VIEW ================= -->
        <template v-if="activeQuestion || activeScenario || activeDialogue">
            <button type="button" class="mb-4 text-sm text-gray-500 hover:text-black" @click="closeItem">
                ← {{ activeSection?.title }}
            </button>

            <!-- Dialogue -->
            <div v-if="activeDialogue" class="space-y-3">
                <h1 class="text-2xl font-bold text-gray-900">{{ activeDialogue.title }}</h1>
                <p class="text-gray-500" dir="rtl">{{ activeDialogue.titlePersian }}</p>

                <div class="space-y-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div v-for="(line, index) in activeDialogue.lines" :key="index">
                        <p class="text-gray-900">
                            <span class="font-semibold">{{ line.speaker }}:</span> {{ line.english }}
                            <SpeechButton :text="line.english" lang="en-US" />
                        </p>
                        <p class="text-sm text-gray-500" dir="rtl">{{ line.persian }}</p>
                    </div>
                </div>

                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Useful expressions</p>
                    <div v-for="item in activeDialogue.vocabulary" :key="item.english" class="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span class="font-medium text-gray-900">{{ item.english }} <SpeechButton :text="item.english" lang="en-US" /></span>
                        <span class="flex items-center gap-2">
                            <span class="text-gray-500" dir="rtl">{{ item.persian }}</span>
                            <button type="button" class="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100" @click="saveVocabulary(item.english, item.persian)">☆</button>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Question / behavioral scenario -->
            <div v-else class="space-y-4">
                <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h1 class="text-xl font-bold text-gray-900">
                        {{ currentPromptText }}
                        <SpeechButton :text="currentPromptText" lang="en-US" />
                    </h1>
                    <p class="mt-1 text-gray-500" dir="rtl">{{ activeQuestion?.questionPersian ?? activeScenario?.promptPersian }}</p>
                </div>

                <!-- Study panel: intention, structure, vocabulary (collapsed; model answer hidden until asked) -->
                <details v-if="activeQuestion" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <summary class="cursor-pointer text-sm font-medium text-gray-700">What the interviewer wants · structure · vocabulary</summary>
                    <p class="mt-3 text-sm text-gray-700"><b>Intention:</b> {{ activeQuestion.intention }}</p>
                    <p class="text-sm text-gray-500" dir="rtl">{{ activeQuestion.intentionPersian }}</p>
                    <p class="mt-2 text-sm text-gray-700"><b>Structure:</b> {{ activeQuestion.structure }}</p>
                    <div v-for="item in activeQuestion.vocabulary" :key="item.english" class="mt-1.5 flex items-center justify-between gap-3 text-sm">
                        <span class="font-medium">{{ item.english }} <SpeechButton :text="item.english" lang="en-US" /></span>
                        <span class="flex items-center gap-2">
                            <span class="text-gray-500" dir="rtl">{{ item.persian }}</span>
                            <button type="button" class="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100" @click="saveVocabulary(item.english, item.persian)">☆</button>
                        </span>
                    </div>
                </details>

                <!-- STAR builder (behavioral) — learner's OWN experience -->
                <div v-if="activeScenario && workingAnswer" class="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p class="text-sm text-amber-700">
                        Use a REAL experience of your own. The AI will help with your English — it will never invent your story.
                    </p>

                    <div v-for="key in STAR_KEYS" :key="key">
                        <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">{{ key }}</label>
                        <p class="text-xs text-gray-500">{{ activeScenario.starHints[key] }}</p>
                        <textarea
                            rows="2"
                            dir="auto"
                            class="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-gray-900"
                            :value="workingAnswer.star[key]"
                            placeholder="Write in Persian or English…"
                            @input="updateStar(key, ($event.target as HTMLTextAreaElement).value)"
                        />
                    </div>

                    <p v-if="starMissing.length" class="text-xs text-gray-400">
                        Still thin: {{ starMissing.join(', ') }}
                    </p>
                    <p v-else class="text-xs text-green-700">✓ STAR complete — now write it as one English answer.</p>

                    <div>
                        <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Persian notes</label>
                        <textarea
                            rows="2" dir="rtl"
                            class="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-gray-900"
                            :value="workingAnswer.persianNotes"
                            @input="savedAnswersStore.update(workingAnswer!.id, { persianNotes: ($event.target as HTMLTextAreaElement).value })"
                        />
                    </div>

                    <div>
                        <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Your English answer</label>
                        <textarea
                            rows="5" dir="auto"
                            class="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-gray-900"
                            :value="workingAnswer.finalAnswer"
                            placeholder="Combine your STAR parts into a spoken-style answer…"
                            @input="savedAnswersStore.update(workingAnswer!.id, { finalAnswer: ($event.target as HTMLTextAreaElement).value })"
                        />
                        <SpeechButton v-if="workingAnswer.finalAnswer.trim()" :text="workingAnswer.finalAnswer" lang="en-US" />
                    </div>
                </div>

                <!-- Free answer (questions) -->
                <div v-else-if="activeQuestion" class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <label class="text-sm font-medium text-gray-700">Your answer (in English)</label>
                    <textarea
                        v-model="answerDraft"
                        rows="5"
                        dir="auto"
                        class="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:border-gray-900"
                        placeholder="Answer as if you were in the interview…"
                        @input="answerFromVoice = false"
                    />

                    <div class="mt-2 flex items-center justify-between">
                        <button
                            v-if="speakingEnabled && voiceSupported"
                            type="button"
                            class="rounded-full px-3 py-2 text-sm transition"
                            :class="isListening ? 'animate-pulse bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                            @click="recordAnswerVoice"
                        >
                            🎙 {{ isListening ? 'Listening…' : 'Answer by voice' }}
                        </button>
                        <span v-else class="text-xs text-gray-400">
                            {{ speakingEnabled ? 'Voice not supported here' : 'Voice answers off (Speaking disabled)' }}
                        </span>
                    </div>
                    <p v-if="answerFromVoice" class="mt-1 text-xs text-gray-400">🎙 Transcribed — edit before evaluating.</p>
                    <p v-if="voiceError" class="mt-1 text-xs text-red-500">{{ voiceError }}</p>
                </div>

                <!-- Evaluate -->
                <button
                    type="button"
                    class="w-full rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                    :disabled="evaluating || !textToEvaluate()"
                    @click="evaluateCurrent"
                >
                    {{ evaluating ? 'Evaluating…' : '🤖 Evaluate my answer' }}
                </button>
                <p v-if="evaluationError" class="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{{ evaluationError }}</p>

                <!-- Evaluation result -->
                <div v-if="evaluation" class="space-y-3">
                    <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p class="text-gray-800">{{ evaluation.overall }}</p>
                        <p class="mt-1 text-xs text-gray-300">Practice feedback — not a certified assessment</p>
                    </div>

                    <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <p class="text-xs text-gray-500">Your answer</p>
                        <p class="whitespace-pre-wrap text-gray-700" dir="auto">{{ textToEvaluate() }}</p>
                        <p class="mt-3 text-xs text-gray-500">Corrected (same facts)</p>
                        <p class="whitespace-pre-wrap font-medium text-gray-900">{{ evaluation.correctedAnswer }}</p>
                        <p class="mt-3 text-xs text-gray-500">More natural & professional (same content)</p>
                        <p class="whitespace-pre-wrap font-medium text-gray-900">
                            {{ evaluation.professionalVersion }}
                            <SpeechButton :text="evaluation.professionalVersion" lang="en-US" />
                        </p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                        <div class="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                            <p class="text-xs font-semibold uppercase tracking-wider text-blue-700">Language</p>
                            <div v-for="dim in evaluation.dimensions.filter(d => d.kind === 'language')" :key="dim.dimension" class="mt-2 text-sm">
                                <p class="font-medium capitalize text-gray-900">{{ dim.dimension.replace('-', ' ') }}</p>
                                <p class="text-gray-600">{{ dim.assessment }}</p>
                            </div>
                        </div>
                        <div class="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
                            <p class="text-xs font-semibold uppercase tracking-wider text-purple-700">Content</p>
                            <div v-for="dim in evaluation.dimensions.filter(d => d.kind === 'content')" :key="dim.dimension" class="mt-2 text-sm">
                                <p class="font-medium capitalize text-gray-900">{{ dim.dimension }}</p>
                                <p class="text-gray-600">{{ dim.assessment }}</p>
                            </div>
                            <ul v-if="evaluation.contentSuggestions.length" class="mt-2 list-inside list-disc text-sm text-gray-700">
                                <li v-for="tip in evaluation.contentSuggestions" :key="tip">{{ tip }}</li>
                            </ul>
                        </div>
                    </div>

                    <div v-if="evaluation.languageIssues.length" class="space-y-2">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Language corrections</p>
                        <div v-for="(issue, index) in evaluation.languageIssues" :key="index" class="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
                            <p class="text-gray-500 line-through decoration-red-300">{{ issue.original }}</p>
                            <p class="font-medium text-gray-900">{{ issue.corrected }}</p>
                            <p class="mt-1 text-gray-600">{{ issue.explanation }}</p>
                            <p v-if="issue.explanationPersian" class="mt-1 rounded bg-gray-50 p-1.5 text-gray-600" dir="rtl">{{ issue.explanationPersian }}</p>
                        </div>
                    </div>

                    <div v-if="evaluation.alternativeExpressions.length" class="rounded-2xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Alternative expressions</p>
                        <p v-for="alt in evaluation.alternativeExpressions" :key="alt.try" class="mt-1">
                            <span class="text-gray-500">{{ alt.insteadOf }}</span> → <b class="text-gray-900">{{ alt.try }}</b>
                        </p>
                    </div>

                    <div v-if="evaluation.followUpPractice.length" class="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">An interviewer might ask next</p>
                        <p v-for="followUp in evaluation.followUpPractice" :key="followUp" class="mt-1">• {{ followUp }}</p>
                    </div>
                </div>

                <!-- Model answer: only on request, never before the learner tries -->
                <div v-if="activeQuestion">
                    <button type="button" class="text-sm text-gray-500 hover:text-black" @click="showModel = !showModel">
                        {{ showModel ? '▾ Hide' : '▸ Show' }} an example answer (adapt it — don't memorize it)
                    </button>
                    <div v-if="showModel" class="mt-2 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm">
                        <p class="text-gray-700">{{ activeQuestion.example }} <SpeechButton :text="activeQuestion.example" lang="en-US" /></p>
                        <div v-if="activeQuestion.followUps.length" class="mt-3 text-gray-500">
                            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Possible follow-ups</p>
                            <p v-for="f in activeQuestion.followUps" :key="f">• {{ f }}</p>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ================= SECTION LIST ================= -->
        <template v-else-if="activeSection && SECTION_ITEMS">
            <button type="button" class="mb-4 text-sm text-gray-500 hover:text-black" @click="activeSection = null; content = null">
                ← Career English
            </button>
            <h1 class="text-2xl font-bold text-gray-900">{{ activeSection.icon }} {{ activeSection.title }}</h1>
            <p class="mb-4 text-gray-500" dir="rtl">{{ activeSection.titlePersian }}</p>

            <div class="space-y-2">
                <button
                    v-for="item in SECTION_ITEMS.questions ?? []"
                    :key="item.id"
                    type="button"
                    class="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                    @click="openQuestion(item)"
                >
                    <p class="font-medium text-gray-900">{{ item.question }}</p>
                    <p class="text-sm text-gray-500" dir="rtl">{{ item.questionPersian }}</p>
                    <p v-if="historyStore.forQuestion(item.id).length" class="mt-1 text-xs text-gray-400">{{ historyStore.forQuestion(item.id).length }} attempt(s)</p>
                </button>

                <button
                    v-for="item in SECTION_ITEMS.scenarios ?? []"
                    :key="item.id"
                    type="button"
                    class="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                    @click="openScenario(item)"
                >
                    <p class="font-medium text-gray-900">{{ item.title }}</p>
                    <p class="text-sm text-gray-500" dir="rtl">{{ item.titlePersian }}</p>
                    <p v-if="savedAnswersStore.forSource(item.id)[0]?.finalAnswer" class="mt-1 text-xs text-green-600">✓ answer drafted</p>
                </button>

                <button
                    v-for="item in SECTION_ITEMS.dialogues ?? []"
                    :key="item.id"
                    type="button"
                    class="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                    @click="openDialogue(item)"
                >
                    <p class="font-medium text-gray-900">{{ item.title }}</p>
                    <p class="text-sm text-gray-500" dir="rtl">{{ item.titlePersian }}</p>
                </button>
            </div>
        </template>

        <!-- ================= HOME ================= -->
        <template v-else>
            <div class="mb-6">
                <h1 class="text-3xl font-bold text-gray-900">Career English</h1>
                <p class="mt-2 text-gray-500">
                    Interviews and professional communication — answer in your own words, with your own real experience.
                    <span class="block text-sm" dir="rtl">برای مصاحبه‌های شغلی و ارتباطات حرفه‌ای — با تجربه واقعی خودت.</span>
                </p>
            </div>

            <div class="mb-6 flex gap-1 overflow-x-auto text-sm">
                <button
                    v-for="(label, key) in { sections: 'Practice', mock: 'Mock Interview', saved: 'Saved Answers', progress: 'Progress' }"
                    :key="key"
                    type="button"
                    class="shrink-0 rounded-full px-4 py-2 transition"
                    :class="tab === key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                    @click="tab = key as Tab"
                >
                    {{ label }}
                </button>
            </div>

            <!-- Sections -->
            <div v-if="tab === 'sections'" class="grid gap-3 sm:grid-cols-2">
                <button
                    v-for="section in sections"
                    :key="section.id"
                    type="button"
                    class="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    @click="openSection(section)"
                >
                    <span class="text-3xl">{{ section.icon }}</span>
                    <p class="mt-2 font-semibold text-gray-900">{{ section.title }}</p>
                    <p class="text-sm text-gray-500" dir="rtl">{{ section.titlePersian }}</p>
                    <p class="mt-1 text-xs text-gray-400">{{ section.cefrLevel }} · ~{{ section.estimatedDuration }} min each</p>
                </button>
            </div>

            <!-- Mock interview -->
            <div v-else-if="tab === 'mock'">
                <div v-if="!mockSessionId" class="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                    <p class="text-gray-700">A full AI-led interview: one question at a time, with follow-ups. No hints — answer like the real thing.</p>
                    <p v-if="aiSettingsStore.settings.provider === 'cloud'" class="mt-2 text-xs text-amber-600">Cloud provider selected — your answers are sent to the configured cloud API.</p>
                    <button type="button" class="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50" :disabled="mockWaiting" @click="startMock">
                        {{ mockWaiting ? 'Starting…' : 'Start mock interview' }}
                    </button>
                    <p v-if="mockError" class="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">{{ mockError }}</p>
                </div>

                <div v-else class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div class="max-h-96 space-y-2 overflow-y-auto">
                        <div v-for="(message, index) in mockMessages" :key="index" class="flex" :class="message.role === 'learner' ? 'justify-end' : 'justify-start'">
                            <div class="max-w-[85%] rounded-2xl px-3 py-2 text-sm" :class="message.role === 'learner' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'">
                                {{ message.text }}
                                <SpeechButton v-if="message.role === 'tutor'" :text="message.text" lang="en-US" />
                                <span v-if="message.voice" class="ml-1 text-xs opacity-60">🎙</span>
                            </div>
                        </div>
                        <p v-if="mockWaiting" class="text-sm text-gray-400">interviewer is thinking…</p>
                        <p v-if="mockError" class="rounded-lg bg-amber-50 p-2 text-sm text-amber-700">{{ mockError }}</p>
                    </div>

                    <p v-if="mockFromVoice" class="mt-2 text-xs text-gray-400">🎙 Transcribed — edit before sending.</p>
                    <div class="mt-2 flex items-end gap-2">
                        <button
                            v-if="speakingEnabled && voiceSupported"
                            type="button"
                            class="shrink-0 rounded-full p-3 transition"
                            :class="isListening ? 'animate-pulse bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                            :disabled="mockWaiting"
                            @click="recordMockVoice"
                        >
                            🎙
                        </button>
                        <textarea
                            v-model="mockDraft"
                            rows="2"
                            dir="auto"
                            placeholder="Your answer…"
                            class="min-w-0 flex-1 rounded-xl border px-3 py-2 outline-none focus:border-gray-900"
                            :disabled="mockWaiting"
                            @input="mockFromVoice = false"
                        />
                        <button type="button" class="shrink-0 rounded-xl bg-black px-4 py-2.5 font-semibold text-white disabled:opacity-40" :disabled="!mockDraft.trim() || mockWaiting" @click="sendMock">
                            Send
                        </button>
                    </div>
                    <button type="button" class="mt-3 text-sm text-gray-500 hover:text-black" @click="endMock">End interview</button>
                </div>
            </div>

            <!-- Saved answers -->
            <div v-else-if="tab === 'saved'" class="space-y-3">
                <p v-if="!savedAnswersStore.answers.length" class="py-8 text-center text-sm text-gray-400">
                    No saved answers yet — build one from Behavioral Interviews → pick a scenario.
                </p>
                <div v-for="answer in savedAnswersStore.answers" :key="answer.id" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div class="flex items-start justify-between gap-2">
                        <p class="font-semibold text-gray-900">{{ answer.title }}</p>
                        <button type="button" class="text-xs text-red-400 hover:text-red-600" @click="savedAnswersStore.remove(answer.id)">Delete</button>
                    </div>
                    <p class="text-xs" :class="isStarComplete(answer.star) ? 'text-green-600' : 'text-gray-400'">
                        {{ isStarComplete(answer.star) ? '✓ STAR complete' : 'STAR incomplete' }} · updated {{ new Date(answer.updatedAt).toLocaleDateString() }}
                    </p>
                    <p v-if="answer.finalAnswer" class="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                        {{ answer.finalAnswer }} <SpeechButton :text="answer.finalAnswer" lang="en-US" />
                    </p>
                </div>
            </div>

            <!-- Progress -->
            <div v-else-if="tab === 'progress'" class="grid grid-cols-2 gap-3">
                <div v-for="(value, label) in { 'Answer attempts': progressSummary.attempts, 'AI-evaluated': progressSummary.evaluated, 'Spoken answers': progressSummary.voice, 'Content tips given': progressSummary.withContentTips, 'Saved answers': progressSummary.savedAnswers }" :key="label" class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs text-gray-500">{{ label }}</p>
                    <p class="mt-1 text-2xl font-bold text-gray-900">{{ value }}</p>
                </div>
            </div>
        </template>
    </div>
</template>
