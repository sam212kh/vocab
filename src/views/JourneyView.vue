<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { loadContentSnapshot } from '../services/journeyContent'
import type { ContentSnapshot } from '../services/journeyContent'
import { planJourney } from '../services/journeyPlanner'
import {
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

import { useJourneyStore } from '../stores/journey'
import { useWordProgressStore } from '../stores/wordProgress'
import { useGrammarProgressStore } from '../stores/grammarProgress'
import { useMistakesStore } from '../stores/mistakes'
import { usePerformanceStore } from '../stores/performance'
import { useSessionSettingsStore } from '../stores/sessionSettings'

import { useSpeakingPractice } from '../composables/useSpeakingPractice'

import ExercisePlayer from '../components/exercise/ExercisePlayer.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'

import { JOURNEY_LENGTH_MINUTES } from '../types/journey'
import type {
    JourneyActivity,
    JourneyLength,
    JourneySummary,
    PlannerInput,
    RetrievalItem,
} from '../types/journey'
import type { ExerciseResult } from '../types/exercise'

const router = useRouter()

const journeyStore = useJourneyStore()
const wordProgressStore = useWordProgressStore()
const grammarProgressStore = useGrammarProgressStore()
const mistakesStore = useMistakesStore()
const performanceStore = usePerformanceStore()
const sessionSettingsStore = useSessionSettingsStore()

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
const constructionSubmitted = ref(false)
const constructionUsed = ref<string[]>([])
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
    constructionSubmitted.value = false
    constructionUsed.value = []
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
function emit(record: ReturnType<typeof retrievalEvidence>) {
    const stored = journeyStore.addEvidence(session.value!.id, record)

    if (stored) performanceStore.record(performanceEventFor(record))

    if (!record.correct) wrongKeys.value.push(record.itemKey)
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

/* ---------- sentence construction (production) ---------- */

function submitConstruction() {
    const activity = currentActivity.value
    const prompt = activity?.construction

    if (!activity || !prompt || constructionSubmitted.value) return

    const record = productionEvidence(
        baseEvidence(activity, prompt.id),
        answer.value,
        prompt.targetExpressions
    )

    constructionUsed.value = record.usedTargets
    constructionSubmitted.value = true

    const { usedTargets: _used, ...evidence } = record

    emit(evidence)
}

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
</script>

<template>
    <div class="mx-auto max-w-2xl">
        <!-- ================= HOME ================= -->
        <template v-if="phase === 'home'">
            <div class="mb-6">
                <h1 class="text-3xl font-bold text-gray-900">Daily Journey</h1>
                <p class="mt-2 text-gray-500">
                    Today's practice, built around what you need — recognize, recall, then use real English.
                    <span class="block text-sm" dir="rtl">تمرین امروز، متناسب با نیاز تو.</span>
                </p>
            </div>

            <div v-if="session" class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p class="font-semibold text-amber-800">You have an unfinished journey</p>
                <p class="text-sm text-amber-700">
                    {{ session.plan.objective }} · {{ Object.values(session.statuses).filter(s => s !== 'pending').length }} / {{ session.plan.activities.length }} done
                </p>
                <button type="button" class="mt-3 rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700" @click="resumeJourney">
                    Continue where you stopped
                </button>
            </div>

            <p v-if="loadError" class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{{ loadError }}</p>

            <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 class="text-sm font-semibold uppercase tracking-wider text-gray-400">How long today?</h2>
                <div class="mt-3 grid grid-cols-3 gap-2">
                    <button
                        v-for="option in (['quick', 'standard', 'extended'] as JourneyLength[])"
                        :key="option"
                        type="button"
                        class="rounded-xl border p-3 text-center transition"
                        :class="length === option ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 hover:bg-gray-50'"
                        @click="length = option"
                    >
                        <p class="font-semibold capitalize">{{ option }}</p>
                        <p class="text-xs" :class="length === option ? 'text-gray-300' : 'text-gray-400'">~{{ JOURNEY_LENGTH_MINUTES[option] }} min</p>
                    </button>
                </div>

                <button
                    type="button"
                    class="mt-5 w-full rounded-xl bg-black px-6 py-3.5 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                    :disabled="loading"
                    @click="startJourney"
                >
                    {{ loading ? 'Preparing your journey…' : 'Start today\'s journey' }}
                </button>
                <p v-if="session" class="mt-2 text-center text-xs text-gray-400">Starting a new journey replaces the unfinished one.</p>
            </div>

            <!-- Roadmap -->
            <div class="mt-6">
                <h2 class="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-400">Your roadmap</h2>
                <p class="mb-3 text-xs text-gray-400">
                    Learning milestones based on what you've demonstrated — not certified CEFR levels. Nothing is locked out: every module stays open.
                </p>

                <div class="space-y-2">
                    <div
                        v-for="stage in roadmap"
                        :key="stage.id"
                        class="rounded-xl border bg-white p-3 shadow-sm"
                        :class="stage.id === currentStage?.id ? 'border-gray-900' : 'border-gray-200'"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <p class="font-medium text-gray-900">{{ stage.title }}</p>
                            <span
                                class="shrink-0 rounded-full px-2 py-0.5 text-xs"
                                :class="{
                                    'bg-green-100 text-green-700': stage.state === 'completed',
                                    'bg-blue-100 text-blue-700': stage.state === 'in-progress' || stage.state === 'available',
                                    'bg-gray-100 text-gray-500': stage.state === 'locked',
                                    'bg-amber-100 text-amber-700': stage.state === 'content-pending',
                                }"
                            >
                                {{ stage.state === 'content-pending' ? 'content coming' : stage.state }}
                            </span>
                        </div>
                        <p class="text-xs text-gray-500">{{ stage.description }}</p>
                        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div class="h-full rounded-full bg-gray-900 transition-all" :style="{ width: `${Math.round(stage.progress * 100)}%` }" />
                        </div>
                        <p class="mt-1 text-xs text-gray-400">{{ stage.requirement }}</p>
                    </div>
                </div>
            </div>
        </template>

        <!-- ================= RUNNING ================= -->
        <template v-else-if="phase === 'running' && session && currentActivity">
            <div class="mb-4">
                <p class="text-xs font-medium uppercase tracking-wider text-gray-400">Today's objective</p>
                <p class="text-gray-800">{{ session.plan.objective }}</p>
            </div>

            <div class="mb-4 flex items-center justify-between text-sm text-gray-500">
                <span>Activity {{ progressLabel }}</span>
                <span>~{{ currentActivity.estimatedMinutes }} min · <span class="capitalize">{{ currentActivity.stage }}</span></span>
            </div>
            <div class="mb-5 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div class="h-full rounded-full bg-gray-900 transition-all" :style="{ width: `${(Object.values(session.statuses).filter(s => s !== 'pending').length / session.plan.activities.length) * 100}%` }" />
            </div>

            <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">{{ currentActivity.title }}</h2>
                <p class="mt-1 text-xs text-gray-400">{{ currentActivity.reason }}</p>

                <!-- RETRIEVAL (typed recall) -->
                <div v-if="currentActivity.kind === 'vocab-retrieval' && currentItem" class="mt-6 text-center">
                    <p class="text-xs text-gray-400">{{ itemIndex + 1 }} / {{ currentActivity.retrievalItems!.length }} — type the English</p>
                    <p class="mt-3 break-words text-2xl font-semibold text-gray-900" dir="rtl">{{ currentItem.persian }}</p>

                    <form v-if="!revealed" class="mt-6" @submit.prevent="submitRetrieval">
                        <input
                            v-model="answer"
                            autocomplete="off"
                            autocapitalize="off"
                            placeholder="Type the English…"
                            class="w-full rounded-xl border px-4 py-3 text-center text-lg outline-none focus:border-gray-900"
                        />
                        <p v-if="hintShown" class="mt-2 text-sm text-gray-500">Starts with: <b>{{ currentItem.english.slice(0, 2) }}…</b></p>
                        <div class="mt-4 flex gap-2">
                            <button type="button" class="rounded-xl border px-4 py-3 text-sm text-gray-500 hover:bg-gray-50" @click="hint">Hint</button>
                            <button type="submit" class="flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800">Check</button>
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
                        <button type="button" class="mt-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800" @click="nextRetrieval">
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
                        class="mt-5 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800"
                        @click="nextExercise"
                    >
                        Next
                    </button>
                </div>

                <!-- CONSTRUCTION (production) -->
                <div v-else-if="currentActivity.kind === 'sentence-construction' && currentActivity.construction" class="mt-5">
                    <p class="text-gray-800">{{ currentActivity.construction.promptEnglish }}</p>
                    <p class="mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-600" dir="rtl">{{ currentActivity.construction.promptPersian }}</p>
                    <p class="mt-3 text-xs text-gray-500">Try to use: <b>{{ currentActivity.construction.targetExpressions.join(', ') }}</b></p>

                    <textarea
                        v-model="answer"
                        rows="3"
                        dir="auto"
                        :disabled="constructionSubmitted"
                        placeholder="Write your own sentence(s) in English…"
                        class="mt-3 w-full rounded-xl border px-3 py-2.5 outline-none focus:border-gray-900"
                    />

                    <button v-if="!constructionSubmitted" type="button" class="mt-3 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-40" :disabled="!answer.trim()" @click="submitConstruction">
                        Submit
                    </button>

                    <div v-else class="mt-4 space-y-2 text-sm">
                        <p :class="constructionUsed.length ? 'text-green-600' : 'text-amber-600'">
                            {{ constructionUsed.length ? `✓ You used: ${constructionUsed.join(', ')}` : 'Try to include one of the target expressions next time.' }}
                        </p>
                        <p class="text-xs text-gray-400">This checks length and expression use only — it can't judge your grammar. Compare with these model sentences:</p>
                        <p v-for="model in currentActivity.construction.modelSentences" :key="model" class="rounded-lg bg-gray-50 p-2 text-gray-700">
                            {{ model }} <SpeechButton :text="model" lang="en-US" />
                        </p>
                        <button type="button" class="mt-2 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white" @click="finishActivity()">Next</button>
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
                        <button v-if="!isListening && !speakResult" type="button" class="mt-5 rounded-full bg-black px-8 py-3 text-white hover:bg-gray-800" @click="speakCurrent">🎙 Speak</button>
                        <p v-else-if="isListening" class="mt-5 text-gray-500">🎙 Listening…</p>
                        <p v-if="voiceError" class="mt-2 text-xs text-red-500">{{ voiceError }}</p>
                        <div v-if="speakResult" class="mt-4 rounded-xl bg-gray-50 p-3 text-left text-sm">
                            <p class="text-xs text-gray-500">You said</p>
                            <p class="font-medium text-gray-800">{{ speakResult.transcript }}</p>
                            <p class="mt-1 text-xs text-gray-400">Transcript match {{ speakResult.score }}% — recognition similarity, not pronunciation scoring.</p>
                        </div>
                    </template>

                    <button type="button" class="mt-5 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800" @click="nextSpeak">
                        {{ speakIndex === currentActivity.speakingSentences.length - 1 ? 'Finish' : 'Next' }}
                    </button>
                </div>

                <!-- HAND-OFF (roleplay / career live in their own modules) -->
                <div v-else-if="currentActivity.route" class="mt-5 text-center">
                    <p class="text-sm text-gray-600">This activity runs in its own module so you get the full experience.</p>
                    <button type="button" class="mt-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800" @click="openHandoff">
                        Open it →
                    </button>
                    <button type="button" class="mt-2 w-full rounded-xl border px-4 py-3 text-gray-600 hover:bg-gray-50" @click="confirmHandoffDone">
                        I've done it — mark complete
                    </button>
                </div>
            </div>

            <div class="mt-4 flex justify-between text-sm text-gray-400">
                <button type="button" class="hover:text-gray-700" @click="skipActivity">Skip this activity</button>
                <button type="button" class="hover:text-gray-700" @click="endEarly">End journey</button>
            </div>
        </template>

        <!-- ================= SUMMARY ================= -->
        <template v-else-if="phase === 'summary' && summary">
            <div class="mb-6 pt-2 text-center">
                <div class="text-5xl leading-none">🌱</div>
                <h1 class="mt-3 text-2xl font-bold text-gray-900">Journey complete</h1>
                <p class="mt-1 text-sm text-gray-400">{{ summary.activitiesCompleted }} / {{ summary.activitiesTotal }} activities</p>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs text-gray-500">Expressions met</p>
                    <p class="mt-1 text-2xl font-bold text-gray-900">{{ summary.expressionsEncountered }}</p>
                </div>
                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs text-gray-500">Recalled independently</p>
                    <p class="mt-1 text-2xl font-bold text-gray-900">{{ summary.expressionsRecalledIndependently }}</p>
                </div>
                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs text-gray-500">Sentences you built</p>
                    <p class="mt-1 text-2xl font-bold text-gray-900">{{ summary.productiveAttempts }}</p>
                </div>
                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <p class="text-xs text-gray-500">Practice effort</p>
                    <p class="mt-1 text-2xl font-bold text-gray-900">{{ summary.effortScore }}</p>
                </div>
            </div>

            <div class="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">By learning stage</p>
                <div v-for="(stats, stage) in summary.stageBreakdown" :key="stage" class="mt-2 flex items-center justify-between text-sm">
                    <span class="capitalize text-gray-700">{{ stage }}</span>
                    <span class="text-gray-500">{{ stats.correct }} / {{ stats.attempts }}</span>
                </div>
                <p class="mt-2 text-xs text-gray-400">Recognition (choosing) and recall/production (you retrieving or writing) are tracked separately on purpose.</p>
            </div>

            <p v-if="summary.skillsPracticed.length" class="mt-4 text-sm text-gray-600">
                Skills practiced: <b>{{ summary.skillsPracticed.join(', ') }}</b>
            </p>

            <div v-if="summary.mistakesWorthReviewing.length" class="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-4 text-sm">
                <p class="font-medium text-amber-800">Worth reviewing</p>
                <p class="mt-1 text-gray-700">{{ summary.mistakesWorthReviewing.join(' · ') }}</p>
                <p class="mt-1 text-xs text-gray-400">Missed words are already rescheduled by spaced repetition.</p>
            </div>

            <p class="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><b>Next:</b> {{ summary.nextSuggestion }}</p>

            <button type="button" class="mt-6 w-full rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800" @click="backHome">Done</button>
        </template>
    </div>
</template>
