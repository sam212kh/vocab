<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loadContentSnapshot } from '../services/journeyContent'
import type { ContentSnapshot } from '../services/journeyContent'
import { planJourney } from '../services/journeyPlanner'
import {
    countsForPerformance,
    evaluatedProductionEvidence,
    performanceEventFor,
    productionEvidence,
    recognitionEvidence,
    retrievalEvidence,
    speakingEvidence,
    stageCountsFrom,
    summarizeSession,
} from '../services/journeyEvidence'
import { buildRoadmap, currentRoadmapStage } from '../services/roadmap'
import { answersMatch } from '../services/textMatch'
import { checkPronunciation } from '../services/pronunciation'
import { evaluateSentence } from '../services/aiClient'
import { resolveExplanationLanguage } from '../services/conversationService'
import { buildSentenceRequest, requestSentenceEvaluation } from '../services/sentenceEvaluation'

import { useJourneyStore } from '../stores/journey'
import { useWordProgressStore } from '../stores/wordProgress'
import { useGrammarProgressStore } from '../stores/grammarProgress'
import { useMistakesStore } from '../stores/mistakes'
import { usePerformanceStore } from '../stores/performance'
import { useSessionSettingsStore } from '../stores/sessionSettings'
import { useAISettingsStore } from '../stores/aiSettings'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { computeIntelligence } from '../services/learningIntelligence'
import { basicTransferCheck, matchedPhrases } from '../services/transfer'
import { lexKey } from '../services/evidenceBridge'
import type { JourneyExtras } from '../services/evidenceBridge'
import { useLearnerProfileStore } from '../stores/learnerProfile'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'
import SentenceFeedback from '../components/journey/SentenceFeedback.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import TransferInsight from '../components/journey/TransferInsight.vue'
import StateBlock from '../components/ui/StateBlock.vue'

import { JOURNEY_LENGTH_MINUTES } from '../types/journey'
import type {
    JourneyActivity,
    JourneyLength,
    JourneySummary,
    PlannerInput,
    RetrievalItem,
} from '../types/journey'
import type { ExerciseResult } from '../types/exercise'
import type { SentenceEvaluation } from '../types/sentenceEvaluation'

const router = useRouter()

const journeyStore = useJourneyStore()
const wordProgressStore = useWordProgressStore()
const grammarProgressStore = useGrammarProgressStore()
const mistakesStore = useMistakesStore()
const performanceStore = usePerformanceStore()
const sessionSettingsStore = useSessionSettingsStore()
const aiSettingsStore = useAISettingsStore()
const evidenceRecorder = useEvidenceRecorder()
const ledgerStore = useLearningEvidenceStore()
const learnerProfileStore = useLearnerProfileStore()

const {
    isSupported: voiceSupported,
    isListening,
    transcript,
    error: voiceError,
    startListening,
    reset: resetVoice,
} = useSpeakingPractice()

const loading = ref(false)
const loadError = ref('')
const snapshot = ref<ContentSnapshot | null>(null)
const length = ref<JourneyLength>('standard')

const phase = ref<'home' | 'running' | 'summary'>('home')
const summary = ref<JourneySummary | null>(null)

const wrongKeys = ref<string[]>([])

const session = computed(() => journeyStore.activeSession)

const currentActivity = computed<JourneyActivity | null>(() => {
    const active = session.value

    if (!active) return null

    return active.plan.activities[active.currentIndex] ?? null
})

const progressLabel = computed(() => {
    const active = session.value

    if (!active) return ''

    const done = Object.values(active.statuses).filter(status => status !== 'pending').length

    return `${done} / ${active.plan.activities.length}`
})

const roadmap = computed(() =>
    buildRoadmap({
        evidence: journeyStore.evidence,
        completedJourneys: journeyStore.completedJourneyCount,
        availableSources: snapshot.value?.availableSources ?? [],
    })
)

const currentStage = computed(() => currentRoadmapStage(roadmap.value))

/* ---------- planning ---------- */

async function ensureSnapshot() {
    if (snapshot.value) return

    loading.value = true
    loadError.value = ''

    try {
        const studied = new Set(wordProgressStore.progress.map(item => item.wordId))
        const due = wordProgressStore.getDueWords()

        snapshot.value = await loadContentSnapshot(studied, due)
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : 'Failed to load content'
    } finally {
        loading.value = false
    }
}

/** Transfer situations used in the last journeys (no-repeat). */
function recentTransferContexts(): string[] {
    return journeyStore.sessions
        .slice(-6)
        .flatMap(item => item.plan.activities.map(activity => activity.transfer?.contextId))
        .filter((id): id is string => !!id)
}

function buildPlannerInput(chosen: JourneyLength): PlannerInput {
    const content = snapshot.value!

    const dueItems: RetrievalItem[] = wordProgressStore
        .getDueWords()
        .map(item => content.wordIndex.get(item.wordId))
        .filter((item): item is RetrievalItem => !!item)

    const summaries = performanceStore.summarizeAll()

    return {
        length: chosen,
        dueWords: dueItems,
        newWords: content.newWords,
        dueGrammarTopics: grammarProgressStore.getDueTopics().map(topic => topic.topicId),
        grammarExercises: content.grammarExercises,
        themes: content.themes,
        dictationExercises: content.dictationExercises,
        careerQuestions: content.careerQuestions,
        recurringMistakeCategories: mistakesStore.recurringErrorCategories(),
        /* A skill is "weak" only with enough observations (≥10) — never one session. */
        weakSkills: summaries
            .filter(item => item.totalEvents >= 10 && item.accuracy < 70)
            .map(item => item.skill),
        recentlyCompleted: journeyStore.recentlyCompletedSourceIds(),
        speakingEnabled: sessionSettingsStore.settings.speakingEnabled,
        stageCounts: stageCountsFrom(journeyStore.evidence),
        evidence: computeIntelligence({
            now: Date.now(),
            items: Object.values(ledgerStore.items),
            events: performanceStore.events,
            srs: wordProgressStore.progress.map(item => ({ key: lexKey(item.wordId), status: item.status, nextReviewAt: item.nextReviewAt })),
            patterns: content.transferPatterns,
            recentContextIds: recentTransferContexts(),
        }).plannerEvidence,
    }
}

async function startJourney() {
    await ensureSnapshot()

    if (!snapshot.value) return

    const plan = planJourney(buildPlannerInput(length.value))

    if (!plan.activities.length) {
        loadError.value = plan.notes.join(' ') || 'No content available for a journey right now.'
        return
    }

    journeyStore.startSession(plan)
    wrongKeys.value = []
    phase.value = 'running'
    resetActivityState()
}

function resumeJourney() {
    phase.value = 'running'
    resetActivityState()
}

/* ---------- activity state ---------- */

const itemIndex = ref(0)
const answer = ref('')
const hintShown = ref(false)
const revealed = ref(false)
const lastCorrect = ref(false)
const exerciseIndex = ref(0)
const exerciseAnswered = ref(false)
type ConstructionPhase = 'writing' | 'evaluating' | 'feedback' | 'unavailable' | 'basic-done'

const constructionPhase = ref<ConstructionPhase>('writing')
const constructionUsed = ref<string[]>([])
const constructionAttempt = ref(1)
const constructionHint = ref('')
const evaluation = ref<SentenceEvaluation | null>(null)
const evaluationInfo = ref({ provider: '', model: '', fallbackUsed: false })
const evaluationUnavailable = ref('')
const correctionRevealed = ref(false)
/** The correction from the previous attempt — "seen" only if it was actually shown. */
const previousCorrection = ref('')

const MAX_CONSTRUCTION_ATTEMPTS = 3
const speakIndex = ref(0)
const speakResult = ref<{ transcript: string; score: number } | null>(null)

function resetActivityState() {
    itemIndex.value = 0
    answer.value = ''
    hintShown.value = false
    revealed.value = false
    lastCorrect.value = false
    exerciseIndex.value = 0
    exerciseAnswered.value = false
    constructionPhase.value = 'writing'
    constructionUsed.value = []
    constructionAttempt.value = 1
    constructionHint.value = ''
    evaluation.value = null
    evaluationUnavailable.value = ''
    correctionRevealed.value = false
    previousCorrection.value = ''
    speakIndex.value = 0
    speakResult.value = null
    resetVoice()
}

function baseEvidence(activity: JourneyActivity, itemKey: string) {
    return {
        sessionId: session.value!.id,
        activityId: activity.id,
        kind: activity.kind,
        skill: activity.skill,
        itemKey,
        timestamp: Date.now(),
    }
}

/** Record evidence in the journey store AND the existing performance store. */
function emit(record: ReturnType<typeof retrievalEvidence>, extras?: JourneyExtras) {
    const stored = journeyStore.addEvidence(session.value!.id, record)

    if (stored) evidenceRecorder.recordJourney(stored, extras)

    /* Only first attempts feed shared skill statistics; retries are practice. */
    if (stored && countsForPerformance(record)) performanceStore.record(performanceEventFor(record))

    if (!record.correct && (record.attempt ?? 1) <= 1 && !record.transfer) wrongKeys.value.push(record.itemKey)
}

/* ---------- retrieval (typed recall → REAL SRS) ---------- */

const currentItem = computed(() => currentActivity.value?.retrievalItems?.[itemIndex.value] ?? null)

function hint() {
    hintShown.value = true
}

function submitRetrieval() {
    const activity = currentActivity.value
    const item = currentItem.value

    if (!activity || !item || revealed.value) return

    const correct = answersMatch(item.english, answer.value, { exact: false })

    lastCorrect.value = correct
    revealed.value = true

    emit(retrievalEvidence(baseEvidence(activity, item.english), correct, hintShown.value ? 1 : 0))

    /* Existing SM-2 — unchanged code path. A hinted success is NOT counted
     * as a clean correct for scheduling purposes: treat as a miss. */
    const countsAsCorrect = correct && !hintShown.value

    if (countsAsCorrect) wordProgressStore.recordCorrect(item.english, item.courseId, item.lessonId)
    else wordProgressStore.recordWrong(item.english, item.courseId, item.lessonId)
}

function nextRetrieval() {
    const activity = currentActivity.value

    if (!activity?.retrievalItems) return

    answer.value = ''
    hintShown.value = false
    revealed.value = false

    if (itemIndex.value < activity.retrievalItems.length - 1) {
        itemIndex.value++
        return
    }

    finishActivity()
}

/* ---------- exercise-based activities (recognition / grammar / dictation) ---------- */

const currentExercise = computed(() => currentActivity.value?.exercises?.[exerciseIndex.value] ?? null)

function onExerciseResult(result: ExerciseResult) {
    const activity = currentActivity.value
    const exercise = currentExercise.value

    if (!activity || !exercise) return

    exerciseAnswered.value = true

    const isSelection = ['multiple-choice', 'matching', 'listening-comprehension', 'reading-comprehension'].includes(exercise.type)

    const base = baseEvidence(activity, exercise.id)

    /* Choice exercises = recognition. Typed ones (dictation/fill/translation)
     * are recall: the learner produced the answer with no options shown. */
    const record = isSelection
        ? recognitionEvidence(base, result.correct)
        : retrievalEvidence(base, result.correct, 0)

    emit({ ...record, kind: activity.kind, skill: exercise.skill })
}

function nextExercise() {
    const activity = currentActivity.value

    if (!activity?.exercises) return

    exerciseAnswered.value = false

    if (exerciseIndex.value < activity.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    finishActivity()
}

/** A contextual-application answer is APPLICATION evidence for its pattern and situation. */
function withTransfer<T extends object>(record: T, activity: JourneyActivity): T & { transfer?: { patternId: string; contextId: string; level: number } } {
    if (!activity.transfer) return record

    return { ...record, transfer: { patternId: activity.transfer.patternId, contextId: activity.transfer.contextId, level: activity.transfer.level } }
}

/* ---------- new-material introduction (exposure only) ---------- */

function completeIntro() {
    const activity = currentActivity.value

    for (const intro of activity?.introItems ?? []) evidenceRecorder.expose(intro.english, 'expression', activity?.sourceId)

    finishActivity('completed')
}

/* ---------- sentence construction (production) ---------- */

const constructionTargets = computed(() => currentActivity.value?.construction?.targetExpressions ?? [])

function attemptContext() {
    return {
        attempt: constructionAttempt.value,
        hintUsed: constructionHint.value !== '',
        /* Only a correction the learner actually saw can make an answer a "copy". */
        seenCorrection: correctionRevealed.value && previousCorrection.value ? previousCorrection.value : null,
    }
}

function showConstructionHint() {
    const first = currentActivity.value?.construction?.modelSentences[0] ?? ''
    const start = first.split(/\s+/).slice(0, 2).join(' ')

    constructionHint.value = start ? `Starts like: "${start}…"` : 'Think of the target expressions above.'
}

/** Deterministic check — length + target use only. Never presented as a grammar evaluation. */
function recordBasicCheck() {
    const activity = currentActivity.value
    const prompt = activity?.construction

    if (!activity || !prompt) return

    const record = productionEvidence(
        baseEvidence(activity, prompt.id),
        answer.value,
        prompt.targetExpressions,
        attemptContext()
    )

    /* A new-situation answer may use ANY wording of the pattern, not just the two target phrases. Still unverified. */
    if (activity.transfer) {
        const pattern = { matches: activity.transfer.matches }

        record.correct = record.assistance !== 'copied-correction' && basicTransferCheck(answer.value, pattern, { targetPhrases: prompt.targetExpressions })
        record.usedTargets = [...new Set([...record.usedTargets, ...matchedPhrases(pattern, answer.value)])]
    }

    constructionUsed.value = record.usedTargets
    constructionPhase.value = 'basic-done'

    const { usedTargets, ...evidence } = record

    emit(withTransfer(evidence, activity), { usedTargets })
}

async function submitConstruction() {
    const activity = currentActivity.value
    const prompt = activity?.construction

    if (!activity || !prompt || constructionPhase.value === 'evaluating') return
    if (!answer.value.trim()) return

    /* AI is optional: with it off, the journey uses the basic check. */
    if (!aiSettingsStore.settings.enabled) {
        recordBasicCheck()
        return
    }

    constructionPhase.value = 'evaluating'
    evaluationUnavailable.value = ''

    const request = buildSentenceRequest(prompt, answer.value, {
        provider: aiSettingsStore.settings.provider,
        model: aiSettingsStore.settings.model,
        allowFallback: aiSettingsStore.settings.allowFallback,
        explanationLanguage: resolveExplanationLanguage(),
        selfReportedLevel: learnerProfileStore.profile.selfReportedLevel ?? '',
    })

    const result = await requestSentenceEvaluation(evaluateSentence, request)

    /* The learner may have skipped/ended while the provider was thinking. */
    if (currentActivity.value?.id !== activity.id) return

    if (result.source === 'ai') {
        evaluation.value = result.evaluation
        evaluationInfo.value = { provider: result.provider, model: result.model, fallbackUsed: result.fallbackUsed }
        constructionPhase.value = 'feedback'

        emit(
            withTransfer(evaluatedProductionEvidence(baseEvidence(activity, prompt.id), result.evaluation, attemptContext()), activity),
            { usedTargets: result.evaluation.content.usedTargets }
        )

        /* After the last allowed attempt, show the correction rather than loop. */
        if (!result.evaluation.passed && constructionAttempt.value >= MAX_CONSTRUCTION_ATTEMPTS) {
            correctionRevealed.value = true
        }

        return
    }

    /* Provider failure: nothing is recorded, nothing is fabricated, the answer stays in the box. */
    evaluationUnavailable.value = result.source === 'unavailable' ? result.message : ''
    constructionPhase.value = result.source === 'unavailable' ? 'unavailable' : 'writing'
}

function retryConstruction() {
    if (!evaluation.value) return

    previousCorrection.value = evaluation.value.correctedSentence
    constructionAttempt.value++
    constructionPhase.value = 'writing'
    /* The learner's text stays editable; the correction stays hidden unless they asked for it. */
}

const canRetryConstruction = computed(() => constructionAttempt.value < MAX_CONSTRUCTION_ATTEMPTS)

/* ---------- speaking (voice-gated; transcript match only) ---------- */

async function speakCurrent() {
    const activity = currentActivity.value
    const sentence = activity?.speakingSentences?.[speakIndex.value]

    if (!activity || !sentence || isListening.value) return

    resetVoice()
    await startListening()

    if (!transcript.value) return

    const { score } = checkPronunciation(sentence, transcript.value)

    speakResult.value = { transcript: transcript.value, score }

    emit(speakingEvidence(baseEvidence(activity, `${activity.sourceId}:${speakIndex.value}`), score))
}

function nextSpeak() {
    const activity = currentActivity.value

    if (!activity?.speakingSentences) return

    speakResult.value = null

    if (speakIndex.value < activity.speakingSentences.length - 1) {
        speakIndex.value++
        return
    }

    finishActivity()
}

/* ---------- completion / navigation ---------- */

function finishActivity(status: 'completed' | 'skipped' = 'completed') {
    const active = session.value
    const activity = currentActivity.value

    if (!active || !activity) return

    journeyStore.completeActivity(active.id, activity.id, status)
    resetActivityState()

    if (!journeyStore.activeSession) showSummary(active.id)
}

function skipActivity() {
    finishActivity('skipped')
}

function openHandoff() {
    const activity = currentActivity.value

    if (!activity?.route) return

    /* Completion is recorded when the learner returns and confirms — we
     * don't fake evidence for work done inside another module. */
    void router.push({ path: activity.route.path, query: activity.route.query })
}

function confirmHandoffDone() {
    finishActivity('completed')
}

function endEarly() {
    const active = session.value

    if (!active) return

    journeyStore.finishSession(active.id)
    showSummary(active.id)
}

function showSummary(sessionId: string) {
    const finished = journeyStore.sessions.find(item => item.id === sessionId)

    if (!finished) return

    const records = journeyStore.evidenceForSession(sessionId)
    const completed = Object.values(finished.statuses).filter(status => status === 'completed').length

    summary.value = summarizeSession(records, completed, finished.plan.activities.length, wrongKeys.value)
    phase.value = 'summary'
}

function backHome() {
    summary.value = null
    phase.value = 'home'
}

const speakingEnabled = computed(() => sessionSettingsStore.settings.speakingEnabled)

onMounted(async () => {
    await ensureSnapshot()

    if (journeyStore.activeSession) {
        /* Interrupted journey: offer resume (do not silently continue). */
        phase.value = 'home'
    }
})
/* ---------- presentation helpers (no learning logic) ---------- */

const doneCount = computed(() =>
    session.value ? Object.values(session.value.statuses).filter(status => status !== 'pending').length : 0
)

/* Introduction is exposure and application is transfer: neither should wear a recognition / production label. */
const KIND_LABEL: Record<string, string> = { 'new-material-intro': 'Introduction', 'contextual-application': 'New situation' }

const STAGE_TONE: Record<string, string> = {
    recognition: 'bg-blue-50 text-blue-700',
    recall: 'bg-practice-100 text-practice-700',
    production: 'bg-learn-100 text-learn-700',
    fluency: 'bg-amber-100 text-amber-700',
}

const STAGE_BAR: Record<string, string> = {
    recognition: 'bg-blue-600/70',
    recall: 'bg-practice-500',
    production: 'bg-learn-500',
    fluency: 'bg-amber-600/80',
}

const LENGTH_LABEL: Record<JourneyLength, string> = { quick: 'Quick', standard: 'Standard', extended: 'Extended' }

const FLOW = [
    { label: 'Recognize', icon: 'target' },
    { label: 'Recall', icon: 'repeat' },
    { label: 'Produce', icon: 'pen' },
    { label: 'Speak', icon: 'mic' },
]

</script>

<template>
    <div class="mx-auto max-w-2xl">
        <!-- ================= HOME ================= -->
        <div v-if="phase === 'home'" class="space-y-6" data-mode="overview">
            <PageHeader
                eyebrow="Daily Journey"
                title="Your journey for today"
                serif
                description="Built around what you need: recognize it, recall it, then use real English."
                description-persian="تمرین امروز، متناسب با نیاز تو."
            />

            <div v-if="session" class="surface flex flex-col gap-4 border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm"><AppIcon name="clock" /></span>
                <div class="min-w-0 flex-1">
                    <p class="font-semibold text-amber-800">You have an unfinished journey</p>
                    <p class="text-sm text-amber-700">{{ session.plan.objective }} · {{ doneCount }} of {{ session.plan.activities.length }} done</p>
                </div>
                <button type="button" class="btn bg-amber-600 text-white hover:bg-amber-700" @click="resumeJourney">Continue where you stopped</button>
            </div>

            <StateBlock v-if="loadError" kind="error" :text="loadError" />

            <section class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2c3f66] via-[#243350] to-[#19243b] p-5 text-white shadow-md sm:p-8" aria-label="Start a journey">
                <div class="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div class="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.06]" />
                    <div class="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-learn-500/15" />
                </div>

                <div class="relative">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">How long today?</p>

                    <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Journey length">
                        <button
                            v-for="option in (['quick', 'standard', 'extended'] as JourneyLength[])"
                            :key="option"
                            type="button"
                            role="radio"
                            :aria-checked="length === option"
                            class="min-h-16 rounded-2xl border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                            :class="length === option ? 'border-white bg-white text-[#243350] shadow-sm' : 'border-white/20 bg-white/5 text-white hover:bg-white/10'"
                            @click="length = option"
                        >
                            <span class="block font-semibold">{{ LENGTH_LABEL[option] }}</span>
                            <span class="block text-xs" :class="length === option ? 'text-[#243350]/70' : 'text-white/60'">about {{ JOURNEY_LENGTH_MINUTES[option] }} min</span>
                        </button>
                    </div>

                    <!-- What a journey is made of -->
                    <ol class="mt-6 flex items-center" aria-label="What a journey contains">
                        <template v-for="(step, index) in FLOW" :key="step.label">
                            <li class="flex flex-col items-center gap-1.5 text-center">
                                <span class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20"><AppIcon :name="step.icon" :size="18" /></span>
                                <span class="text-[0.7rem] font-medium text-white/75 sm:text-xs">{{ step.label }}</span>
                            </li>
                            <li v-if="index < FLOW.length - 1" class="mb-5 h-px flex-1 bg-white/20" aria-hidden="true" />
                        </template>
                    </ol>

                    <button type="button" class="btn btn-lg mt-7 w-full bg-white !text-[#243350] shadow-sm hover:bg-gray-100" :disabled="loading" @click="startJourney">
                        {{ loading ? 'Preparing your journey…' : "Start today's journey" }}
                        <AppIcon v-if="!loading" name="chevron-right" :size="18" />
                    </button>
                    <p v-if="session" class="mt-2 text-center text-xs text-white/60">Starting a new journey replaces the unfinished one.</p>
                </div>
            </section>

            <!-- Roadmap: a path, not a pile of cards -->
            <section aria-label="Your roadmap">
                <h2 class="label">Your roadmap</h2>
                <p class="mb-3 mt-1 text-xs text-gray-400">Milestones based on what you have demonstrated, not certified CEFR levels. Nothing is locked out: every module stays open.</p>

                <ol class="surface p-4 sm:p-5">
                    <li v-for="(stage, index) in roadmap" :key="stage.id" class="relative flex gap-4 pb-5 last:pb-0">
                        <span v-if="index < roadmap.length - 1" class="absolute left-[0.95rem] top-8 bottom-0 w-px bg-gray-200" aria-hidden="true" />

                        <span
                            class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2"
                            :class="{
                                'border-green-600 bg-green-600 text-white': stage.state === 'completed',
                                'border-accent bg-accent text-white ring-4 ring-accent/15': stage.id === currentStage?.id && stage.state !== 'completed',
                                'border-accent/50 bg-white text-accent': stage.id !== currentStage?.id && (stage.state === 'in-progress' || stage.state === 'available'),
                                'border-gray-200 bg-white text-gray-300': stage.state === 'locked',
                                'border-dashed border-amber-300 bg-amber-50 text-amber-600': stage.state === 'content-pending',
                            }"
                        >
                            <AppIcon v-if="stage.state === 'completed'" name="check" :size="15" />
                            <AppIcon v-else-if="stage.state === 'locked'" name="lock" :size="13" />
                            <span v-else class="text-xs font-semibold tabular-nums">{{ index + 1 }}</span>
                        </span>

                        <div class="min-w-0 flex-1 pt-0.5">
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p class="font-semibold text-gray-900" :class="stage.state === 'locked' ? 'text-gray-500' : ''">{{ stage.title }}</p>
                                <span v-if="stage.id === currentStage?.id" class="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">you are here</span>
                                <span v-else-if="stage.state === 'content-pending'" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">content coming</span>
                            </div>
                            <p class="text-sm text-gray-500">{{ stage.description }}</p>
                            <div v-if="stage.progress > 0" class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div class="h-full rounded-full bg-accent motion-safe-only transition-all" :style="{ width: `${Math.round(stage.progress * 100)}%` }" />
                            </div>
                            <p class="mt-1 text-xs text-gray-400">{{ stage.requirement }}</p>
                        </div>
                    </li>
                </ol>
            </section>
        </div>

        <!-- ================= RUNNING ================= -->
        <div v-else-if="phase === 'running' && session && currentActivity" data-mode="practice">
            <header class="mb-4">
                <div class="flex items-center justify-between gap-3">
                    <p class="eyebrow">Activity {{ Math.min(doneCount + 1, session.plan.activities.length) }} of {{ session.plan.activities.length }}</p>
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" :class="STAGE_TONE[currentActivity.stage]">
                        <span class="capitalize">{{ KIND_LABEL[currentActivity.kind] ?? currentActivity.stage }}</span> <span class="font-normal opacity-70">· ~{{ currentActivity.estimatedMinutes }} min</span>
                    </span>
                </div>

                <ol class="mt-3 flex gap-1.5" aria-label="Journey progress">
                    <li
                        v-for="(activity, i) in session.plan.activities"
                        :key="activity.id"
                        class="h-1.5 flex-1 rounded-full motion-safe-only transition-colors"
                        :class="i === session.currentIndex ? 'bg-accent' : session.statuses[activity.id] === 'completed' ? 'bg-accent/50' : session.statuses[activity.id] === 'skipped' ? 'bg-gray-300' : 'bg-gray-200'"
                        :aria-current="i === session.currentIndex ? 'step' : undefined"
                        :title="activity.title"
                    />
                </ol>

                <p class="mt-3 text-sm text-gray-500"><span class="font-semibold text-gray-700">Today:</span> {{ session.plan.objective }}</p>
            </header>

            <div class="surface p-5 sm:p-7">
                <h2 class="text-xl font-bold tracking-tight text-gray-900">{{ currentActivity.title }}</h2>
                <p class="mt-1 text-sm text-gray-400">{{ currentActivity.reason }}</p>

                <!-- NEW MATERIAL: introduction only (exposure — nothing is tested or scored) -->
                <div v-if="currentActivity.kind === 'new-material-intro' && currentActivity.introItems" class="mt-5" data-testid="intro">
                    <p class="text-sm text-gray-500">Look and listen. Nothing is tested yet — recall comes after you have seen these.</p>

                    <ul class="mt-4 space-y-3">
                        <li v-for="intro in currentActivity.introItems" :key="intro.english" class="rounded-2xl bg-gray-50 p-4">
                            <div class="flex items-start gap-2">
                                <div class="min-w-0 flex-1">
                                    <p class="font-display wrap-anywhere text-xl font-semibold text-gray-900" dir="ltr" lang="en">{{ intro.english }}</p>
                                    <p class="fa-text text-gray-600" lang="fa">{{ intro.persian }}</p>
                                    <p v-if="intro.example" class="mt-2 text-sm text-gray-700" dir="ltr" lang="en">{{ intro.example }}</p>
                                    <p v-if="intro.examplePersian" class="fa-text text-sm text-gray-500" lang="fa">{{ intro.examplePersian }}</p>
                                </div>
                                <SpeechButton :text="intro.english" lang="en-US" />
                            </div>
                        </li>
                    </ul>

                    <button type="button" class="btn-primary btn-lg mt-5 w-full" data-testid="intro-done" @click="completeIntro">I've looked at these</button>
                </div>

                <!-- RETRIEVAL (typed recall) -->
                <div v-else-if="currentActivity.kind === 'vocab-retrieval' && currentItem" class="mt-6 text-center">
                    <p class="text-xs text-gray-400">{{ itemIndex + 1 }} / {{ currentActivity.retrievalItems!.length }} — type the English</p>
                    <p class="mt-3 break-words text-2xl font-semibold text-gray-900" dir="rtl">{{ currentItem.persian }}</p>

                    <form v-if="!revealed" class="mt-6" @submit.prevent="submitRetrieval">
                        <input
                            v-model="answer"
                            autocomplete="off"
                            autocapitalize="off"
                            placeholder="Type the English…"
                            class="field w-full text-center text-lg"
                        />
                        <p v-if="hintShown" class="mt-2 text-sm text-gray-500">Starts with: <b>{{ currentItem.english.slice(0, 2) }}…</b></p>
                        <div class="mt-4 flex gap-2">
                            <button type="button" class="rounded-xl border px-4 py-3 text-sm text-gray-500 hover:bg-gray-50" @click="hint">Hint</button>
                            <button type="submit" class="btn-primary btn-lg flex-1">Check</button>
                        </div>
                    </form>

                    <div v-else class="mt-6">
                        <p class="text-sm" :class="lastCorrect ? 'text-green-600' : 'text-red-600'">
                            {{ lastCorrect ? (hintShown ? '✓ Correct (with a hint — it will come back sooner)' : '✓ Recalled!') : 'Not quite' }}
                        </p>
                        <div class="mt-2 rounded-xl bg-gray-50 p-3 text-left text-sm">
                            <p class="text-xs text-gray-500">Your answer</p>
                            <p class="font-medium text-gray-800">{{ answer || '(nothing)' }}</p>
                            <p class="mt-2 text-xs text-gray-500">Correct answer</p>
                            <p class="font-medium text-gray-800">{{ currentItem.english }} <SpeechButton :text="currentItem.english" lang="en-US" /></p>
                        </div>
                        <button type="button" class="btn-primary btn-lg mt-4 w-full" @click="nextRetrieval">
                            Next
                        </button>
                    </div>
                </div>

                <!-- EXERCISES (recognition / grammar / dictation) -->
                <div v-else-if="currentExercise" class="mt-5">
                    <p class="mb-3 text-xs text-gray-400">{{ exerciseIndex + 1 }} / {{ currentActivity.exercises!.length }}</p>
                    <ExercisePlayer :key="currentExercise.id" :exercise="currentExercise" @result="onExerciseResult" />
                    <button
                        v-if="exerciseAnswered"
                        type="button"
                        class="btn-primary btn-lg mt-5 w-full"
                        @click="nextExercise"
                    >
                        Next
                    </button>
                </div>

                <!-- CONSTRUCTION (production) -->
                <div v-else-if="(currentActivity.kind === 'sentence-construction' || currentActivity.kind === 'contextual-application') && currentActivity.construction" class="mt-5">
                    <p class="text-gray-800">{{ currentActivity.construction.promptEnglish }}</p>
                    <p class="mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-600" dir="rtl">{{ currentActivity.construction.promptPersian }}</p>
                    <p v-if="currentActivity.transfer" class="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-accent-ink" data-testid="transfer-note">
                        New situation. You already know “{{ currentActivity.transfer.anchorExpression }}” — use the same kind of language here, in your own words.
                    </p>
                    <p class="mt-3 text-xs text-gray-500">Try to use: <b>{{ currentActivity.construction.targetExpressions.join(', ') }}</b></p>

                    <textarea
                        v-model="answer"
                        rows="3"
                        dir="auto"
                        data-testid="construction-input"
                        :disabled="constructionPhase === 'evaluating' || constructionPhase === 'feedback' || constructionPhase === 'basic-done'"
                        placeholder="Write your own sentence(s) in English…"
                        class="field mt-3 w-full"
                    />

                    <p v-if="constructionAttempt > 1 && constructionPhase === 'writing'" class="mt-2 text-xs text-gray-500">
                        Attempt {{ constructionAttempt }} — edit your sentence and try again. Retries count as practice, not as independent production.
                    </p>
                    <p v-if="constructionHint" class="mt-2 text-xs text-amber-700">{{ constructionHint }} <span class="text-gray-400">(hint — this answer won't count as independent)</span></p>

                    <!-- writing -->
                    <template v-if="constructionPhase === 'writing'">
                        <button type="button" class="btn-primary btn-lg mt-3 w-full" data-testid="construction-submit" :disabled="!answer.trim()" @click="submitConstruction">
                            {{ aiSettingsStore.settings.enabled ? 'Check my sentence' : 'Submit' }}
                        </button>
                        <button v-if="!constructionHint && constructionAttempt === 1" type="button" class="mt-1 inline-flex min-h-11 w-full items-center justify-center text-sm text-gray-500 hover:text-gray-800" @click="showConstructionHint">
                            Need a hint?
                        </button>
                        <p v-if="!aiSettingsStore.settings.enabled" class="mt-2 text-xs text-gray-400">AI feedback is off in AI Settings — this will be a basic check (length and expression use only).</p>
                    </template>

                    <!-- evaluating -->
                    <p v-else-if="constructionPhase === 'evaluating'" class="mt-3 text-center text-sm text-gray-500" data-testid="evaluating">Checking your sentence…</p>

                    <!-- provider unavailable: answer preserved, nothing fabricated -->
                    <div v-else-if="constructionPhase === 'unavailable'" class="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="eval-unavailable">
                        <p class="text-amber-800">{{ evaluationUnavailable }}</p>
                        <p class="text-xs text-amber-700">Your answer is saved here. No feedback or score was recorded.</p>
                        <button type="button" class="btn-primary btn-lg w-full" data-testid="eval-retry" @click="submitConstruction">Retry AI feedback</button>
                        <button type="button" class="w-full rounded-xl border bg-white px-4 py-2.5 text-gray-700 hover:bg-gray-50" data-testid="basic-check" @click="recordBasicCheck">
                            Continue with a basic check (length + expression use only)
                        </button>
                    </div>

                    <!-- AI feedback -->
                    <template v-else-if="constructionPhase === 'feedback' && evaluation">
                        <SentenceFeedback
                            :evaluation="evaluation"
                            :provider="evaluationInfo.provider"
                            :model="evaluationInfo.model"
                            :fallback-used="evaluationInfo.fallbackUsed"
                            :correction-visible="correctionRevealed"
                            :can-retry="canRetryConstruction"
                            :targets="constructionTargets"
                            @reveal="correctionRevealed = true"
                            @retry="retryConstruction"
                        />
                        <TransferInsight v-if="currentActivity.transfer?.learn" :learn="currentActivity.transfer.learn" />
                        <button v-if="evaluation.passed || !canRetryConstruction" type="button" class="btn-primary btn-lg mt-4 w-full" data-testid="construction-next" @click="finishActivity()">Next</button>
                        <button v-else type="button" class="mt-3 w-full text-xs text-gray-400 hover:text-gray-700" @click="finishActivity()">Move on without retrying</button>
                    </template>

                    <!-- basic (deterministic) check -->
                    <div v-else-if="constructionPhase === 'basic-done'" class="mt-4 space-y-2 text-sm" data-testid="basic-result">
                        <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">Basic check — not a grammar evaluation</p>
                        <p :class="constructionUsed.length ? 'text-green-600' : 'text-amber-600'">
                            {{ constructionUsed.length ? `✓ You used: ${constructionUsed.join(', ')}` : 'Try to include one of the target expressions next time.' }}
                        </p>
                        <p class="text-xs text-gray-400">This checks length and expression use only — it can't judge your grammar or meaning. Compare with these model sentences:</p>
                        <p v-for="model in currentActivity.construction.modelSentences" :key="model" class="rounded-lg bg-gray-50 p-2 text-gray-700">
                            {{ model }} <SpeechButton :text="model" lang="en-US" />
                        </p>
                        <TransferInsight v-if="currentActivity.transfer?.learn" :learn="currentActivity.transfer.learn" />
                        <button type="button" class="btn-primary btn-lg mt-2 w-full" data-testid="construction-next" @click="finishActivity()">Next</button>
                    </div>
                </div>

                <!-- SPEAKING (voice only) -->
                <div v-else-if="currentActivity.kind === 'speaking' && currentActivity.speakingSentences" class="mt-5 text-center">
                    <p class="text-xs text-gray-400">{{ speakIndex + 1 }} / {{ currentActivity.speakingSentences.length }} — say it aloud</p>
                    <p class="mt-3 text-xl font-semibold text-gray-900">
                        {{ currentActivity.speakingSentences[speakIndex] }}
                        <SpeechButton :text="currentActivity.speakingSentences[speakIndex]" lang="en-US" />
                    </p>

                    <div v-if="!speakingEnabled || !voiceSupported" class="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
                        {{ speakingEnabled ? 'Speech recognition is not supported in this browser.' : 'Speaking is turned off in your settings.' }}
                        Read it aloud on your own — no speaking evidence is recorded.
                    </div>
                    <template v-else>
                        <button v-if="!isListening && !speakResult" type="button" class="mt-5 rounded-full bg-accent px-8 py-3 text-white hover:bg-accent-strong" @click="speakCurrent">Speak</button>
                        <p v-else-if="isListening" class="mt-5 text-gray-500">Listening…</p>
                        <p v-if="voiceError" class="mt-2 text-xs text-red-500">{{ voiceError }}</p>
                        <div v-if="speakResult" class="mt-4 rounded-xl bg-gray-50 p-3 text-left text-sm">
                            <p class="text-xs text-gray-500">You said</p>
                            <p class="font-medium text-gray-800">{{ speakResult.transcript }}</p>
                            <p class="mt-1 text-xs text-gray-400">Transcript match {{ speakResult.score }}% — recognition similarity, not pronunciation scoring.</p>
                        </div>
                    </template>

                    <button type="button" class="btn-primary btn-lg mt-5 w-full" @click="nextSpeak">
                        {{ speakIndex === currentActivity.speakingSentences.length - 1 ? 'Finish' : 'Next' }}
                    </button>
                </div>

                <!-- HAND-OFF (roleplay / career live in their own modules) -->
                <div v-else-if="currentActivity.route" class="mt-5 text-center">
                    <p class="text-sm text-gray-600">This activity runs in its own module so you get the full experience.</p>
                    <button type="button" class="btn-primary btn-lg mt-4 w-full" @click="openHandoff">
                        Open it →
                    </button>
                    <button type="button" class="mt-2 w-full rounded-xl border px-4 py-3 text-gray-600 hover:bg-gray-50" @click="confirmHandoffDone">
                        I've done it — mark complete
                    </button>
                </div>
            </div>

            <div class="mt-3 flex justify-between text-sm text-gray-400">
                <button type="button" class="inline-flex min-h-11 items-center rounded-lg px-1 hover:text-gray-700" @click="skipActivity">Skip this activity</button>
                <button type="button" class="inline-flex min-h-11 items-center rounded-lg px-1 hover:text-gray-700" @click="endEarly">End journey</button>
            </div>
        </div>

        <!-- ================= SUMMARY ================= -->
        <div v-else-if="phase === 'summary' && summary" class="space-y-5" data-mode="overview">
            <header class="pt-2 text-center">
                <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><AppIcon name="check" :size="30" /></span>
                <h1 class="font-display mt-4 font-semibold">Journey complete</h1>
                <p class="mt-1 text-sm text-gray-500">{{ summary.activitiesCompleted }} of {{ summary.activitiesTotal }} activities completed</p>
            </header>

            <div class="grid grid-cols-2 gap-3">
                <div class="surface p-4">
                    <p class="text-xs text-gray-400">Expressions met</p>
                    <p class="font-display mt-1 text-3xl font-semibold tabular-nums text-gray-900">{{ summary.expressionsEncountered }}</p>
                </div>
                <div class="surface p-4">
                    <p class="text-xs text-gray-400">Recalled independently</p>
                    <p class="font-display mt-1 text-3xl font-semibold tabular-nums text-gray-900">{{ summary.expressionsRecalledIndependently }}</p>
                </div>
                <div class="surface p-4">
                    <p class="text-xs text-gray-400">Sentences you built</p>
                    <p class="font-display mt-1 text-3xl font-semibold tabular-nums text-gray-900">{{ summary.productiveAttempts }}</p>
                    <p v-if="summary.productiveAttempts" class="mt-1 text-xs text-gray-400" data-testid="production-breakdown">
                        {{ summary.production.independent }} unaided<template v-if="summary.production.hintAssisted"> · {{ summary.production.hintAssisted }} with hint</template><template v-if="summary.production.afterFeedback"> · {{ summary.production.afterFeedback }} retried after feedback</template><template v-if="summary.production.basicCheckOnly"> · {{ summary.production.basicCheckOnly }} basic check only</template>
                    </p>
                </div>
                <div class="surface p-4">
                    <p class="text-xs text-gray-400">Practice effort</p>
                    <p class="font-display mt-1 text-3xl font-semibold tabular-nums text-gray-900">{{ summary.effortScore }}</p>
                </div>
            </div>

            <section class="surface p-5">
                <h2 class="label">By learning stage</h2>
                <div v-for="(stats, stage) in summary.stageBreakdown" :key="stage" class="mt-3">
                    <div class="flex items-center justify-between text-sm">
                        <span class="capitalize text-gray-700">{{ stage }}</span>
                        <span class="tabular-nums text-gray-400">{{ stats.attempts ? `${stats.correct} of ${stats.attempts}` : 'not practiced' }}</span>
                    </div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div class="h-full rounded-full" :class="STAGE_BAR[stage]" :style="{ width: stats.attempts ? `${Math.round((stats.correct / stats.attempts) * 100)}%` : '0%' }" />
                    </div>
                </div>
                <p class="mt-4 text-xs text-gray-400">Recognition (choosing) and recall or production (you retrieving or writing) are tracked separately on purpose.</p>
            </section>

            <p v-if="summary.skillsPracticed.length" class="text-sm text-gray-600">Skills practiced: <b>{{ summary.skillsPracticed.join(', ') }}</b></p>

            <section v-if="summary.mistakesWorthReviewing.length" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p class="font-semibold text-amber-800">Worth reviewing</p>
                <p class="mt-1 text-gray-700">{{ summary.mistakesWorthReviewing.join(' · ') }}</p>
                <p class="mt-1 text-xs text-gray-500">Missed words are already rescheduled by spaced repetition.</p>
            </section>

            <p class="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-accent-ink"><b>Next:</b> {{ summary.nextSuggestion }}</p>

            <button type="button" class="btn-primary btn-lg w-full" @click="backHome">Done</button>
        </div>
    </div>
</template>
