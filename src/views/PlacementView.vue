<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '../components/ui/PageHeader.vue'
import StateBlock from '../components/ui/StateBlock.vue'
import ActivityBar from '../components/practice/ActivityBar.vue'
import AnswerFeedback from '../components/practice/AnswerFeedback.vue'

import {
    completeAssessment,
    fetchAssessmentResult,
    pauseAssessment,
    resumeAssessment,
    startAssessment,
    submitAnswer,
} from '../services/assessmentClient'
import { describeEstimate, NOT_YET_ASSESSED_SKILLS, PLACEMENT_SKILLS } from '../services/placementSummary'
import { useAssessmentsStore } from '../stores/assessments'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useSkillProfileStore } from '../stores/skillProfile'
import { buildRoadmap, currentRoadmapStage } from '../services/roadmap'
import { useJourneyStore } from '../stores/journey'

import type { AssessmentAnswer, AssessmentProgress, AssessmentSkill, SanitizedAssessmentItem, SkillEstimateResult } from '../types/assessment'

const router = useRouter()
const assessmentsStore = useAssessmentsStore()
const learnerProfileStore = useLearnerProfileStore()
const skillProfileStore = useSkillProfileStore()
const journeyStore = useJourneyStore()

type Phase = 'intro' | 'running' | 'error' | 'result'

const phase = ref<Phase>('intro')
const error = ref('')
const loading = ref(false)

const skillIndex = ref(0)
const currentSkill = computed<AssessmentSkill>(() => PLACEMENT_SKILLS[skillIndex.value])

const sessionId = ref<string | null>(null)
const currentItem = ref<SanitizedAssessmentItem | null>(null)
const progress = ref<AssessmentProgress | null>(null)
const revealed = ref<null | { correct: boolean }>(null)
const startedAt = ref(0)

/* Local answer-in-progress state, one slot per item type. */
const choiceIndex = ref<number | null>(null)
const textAnswer = ref('')
const orderIndices = ref<number[]>([])
const matchSelections = ref<Record<number, number | null>>({})

const results = ref<Partial<Record<AssessmentSkill, SkillEstimateResult>>>({})
const pendingNextItem = ref<SanitizedAssessmentItem | null>(null)

const resumable = computed(() => assessmentsStore.resumableSession)
const canResume = computed(() =>
    resumable.value !== null &&
    resumable.value.kind === 'placement' &&
    (PLACEMENT_SKILLS as readonly string[]).includes(resumable.value.skill)
)

onMounted(() => {
    /* An existing verified estimate for every placement skill means this is a retake, not a first run — no special-casing needed beyond the copy on the intro screen, which is reactive already. */
})

function resetItemState() {
    choiceIndex.value = null
    textAnswer.value = ''
    orderIndices.value = currentItem.value?.segments ? currentItem.value.segments.map((_, index) => index) : []
    matchSelections.value = {}
    revealed.value = null
    startedAt.value = Date.now()
}

async function beginSkill(skill: AssessmentSkill) {
    loading.value = true
    error.value = ''

    try {
        const response = await startAssessment({
            skill,
            kind: 'placement',
            selfReportedLevel: learnerProfileStore.profile.selfReportedLevel,
        })

        sessionId.value = response.sessionId
        currentItem.value = response.item
        progress.value = response.progress
        assessmentsStore.trackStarted(response.sessionId, skill, 'placement')
        resetItemState()
        phase.value = response.item ? 'running' : 'error'
        if (!response.item) error.value = 'No questions were available for this skill.'
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not start the assessment.'
        phase.value = 'error'
    } finally {
        loading.value = false
    }
}

async function resumeInProgress() {
    if (!resumable.value) return

    loading.value = true
    error.value = ''

    try {
        const response = await resumeAssessment(resumable.value.id)

        sessionId.value = resumable.value.id
        skillIndex.value = Math.max(0, PLACEMENT_SKILLS.indexOf(resumable.value.skill as (typeof PLACEMENT_SKILLS)[number]))
        currentItem.value = response.item
        progress.value = response.progress
        resetItemState()
        phase.value = response.item ? 'running' : 'error'
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not resume the assessment.'
        phase.value = 'error'
    } finally {
        loading.value = false
    }
}

async function pauseAndLeave() {
    if (sessionId.value) {
        try {
            await pauseAssessment(sessionId.value)
            assessmentsStore.setStatus(sessionId.value, 'paused')
        } catch {
            /* Leaving anyway — a failed pause call just means it stays active server-side until it naturally expires. */
        }
    }

    router.push('/profile')
}

function buildAnswer(item: SanitizedAssessmentItem): AssessmentAnswer | null {
    switch (item.type) {
        case 'multiple-choice':
        case 'listening-comprehension':
        case 'reading-comprehension':
            return choiceIndex.value === null ? null : { kind: 'choice', index: choiceIndex.value }

        case 'fill-blank':
        case 'short-answer':
        case 'grammar-correction':
        case 'dictation':
        case 'translation':
            return textAnswer.value.trim() ? { kind: 'text', text: textAnswer.value.trim() } : null

        case 'sentence-ordering':
            return { kind: 'ordering', order: orderIndices.value }

        case 'matching': {
            const entries = Object.entries(matchSelections.value)
            if (!entries.length || entries.some(([, right]) => right === null)) return null
            return {
                kind: 'matching',
                matches: entries.map(([left, right]) => ({ leftIndex: Number(left), rightIndex: right as number })),
            }
        }

        default:
            return null
    }
}

const canSubmit = computed(() => {
    if (!currentItem.value || revealed.value) return false
    return buildAnswer(currentItem.value) !== null
})

async function submit() {
    if (!currentItem.value || !sessionId.value) return

    const answer = buildAnswer(currentItem.value)
    if (!answer) return

    const timeSpentMs = Date.now() - startedAt.value
    const item = currentItem.value

    loading.value = true

    try {
        const response = await submitAnswer(sessionId.value, item.id, answer, timeSpentMs)

        assessmentsStore.recordAnswer(sessionId.value, {
            itemId: item.id,
            level: item.cefrLevel,
            itemType: item.type,
            correct: response.correct,
            timeSpentMs,
        })

        revealed.value = { correct: response.correct }
        progress.value = response.progress
        /* Hold the next item until the learner taps Continue, so the feedback is seen. */
        pendingNextItem.value = response.item
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not submit that answer.'
        phase.value = 'error'
    } finally {
        loading.value = false
    }
}

async function continueAfterFeedback() {
    const nextItem = pendingNextItem.value
    pendingNextItem.value = null

    if (nextItem) {
        currentItem.value = nextItem
        resetItemState()
        return
    }

    await finishCurrentSkill()
}

async function finishCurrentSkill() {
    if (!sessionId.value) return

    loading.value = true
    error.value = ''

    try {
        /*
         * The server already auto-completes a session once its item budget
         * is exhausted (the normal way we get here — see
         * ai-service/assessment/routes.mjs), so this call is only needed
         * for a hypothetical future "finish early" action. It 409s
         * ("already completed") on the path every real run takes today —
         * that's expected, not a failure, so it's swallowed here rather
         * than surfaced. A genuinely not-ready session still fails loudly
         * on the fetchAssessmentResult call right below.
         */
        try {
            await completeAssessment(sessionId.value)
        } catch {
            /* expected when the session already auto-completed */
        }

        const result = await fetchAssessmentResult(sessionId.value)

        assessmentsStore.recordResult(sessionId.value, result.result)
        results.value = { ...results.value, [currentSkill.value]: result.result }

        const { strengths, weaknesses } = describeEstimate(result.result)

        if (result.result.level) {
            skillProfileStore.recordVerified(currentSkill.value, result.result.level, result.result.confidence, result.result.notes.join(' '))
        }

        skillProfileStore.setStrengthsAndWeaknesses(currentSkill.value, strengths, weaknesses)

        if (skillIndex.value + 1 < PLACEMENT_SKILLS.length) {
            skillIndex.value += 1
            await beginSkill(currentSkill.value)
        } else {
            phase.value = 'result'
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not finish this skill.'
        phase.value = 'error'
    } finally {
        loading.value = false
    }
}

const roadmapStage = computed(() =>
    currentRoadmapStage(buildRoadmap({
        evidence: journeyStore.evidence,
        completedJourneys: journeyStore.completedJourneyCount,
        availableSources: ['vocabulary', 'grammar', 'real-life', 'career', 'conversation'],
    }))
)

function confidenceLabel(confidence: number): string {
    if (confidence >= 0.65) return 'fairly confident'
    if (confidence >= 0.4) return 'a rough estimate'
    return 'a very rough estimate — more practice will sharpen this'
}

function finishAndGoToDashboard() {
    router.push('/')
}
</script>

<template>
    <div class="mx-auto max-w-2xl">
        <PageHeader
            eyebrow="Placement"
            title="Placement test"
            description="An adaptive check of your vocabulary and grammar level — about 10-15 minutes, pause any time."
        />

        <div class="mt-6">
            <div v-if="phase === 'intro'" class="surface space-y-4 p-6">
                <p class="text-sm text-gray-600">
                    This test adapts as you go: it gets harder when you're doing well and easier
                    when you're not, and stops once it has enough evidence for a level. It covers
                    <strong>vocabulary and grammar</strong> today — we don't yet have placement
                    content for listening, reading, writing or speaking, so those will show as
                    "not yet assessed" afterwards rather than a guessed level.
                </p>
                <p class="text-sm text-gray-500">It's an estimate to help you start in the right place, not a certified score.</p>

                <div v-if="canResume" class="rounded-xl border border-accent/30 bg-accent-soft p-3 text-sm text-accent-ink">
                    You have a paused placement test in progress.
                </div>

                <div class="flex flex-wrap gap-3">
                    <button v-if="canResume" type="button" class="btn-primary btn-lg" :disabled="loading" @click="resumeInProgress">
                        Resume test
                    </button>
                    <button type="button" class="btn-primary btn-lg" :disabled="loading" @click="beginSkill(PLACEMENT_SKILLS[0])">
                        Start placement test
                    </button>
                    <button type="button" class="btn-ghost" @click="router.push('/')">Skip for now</button>
                </div>
            </div>

            <StateBlock v-else-if="phase === 'error'" kind="error" title="Something went wrong" :text="error" action-label="Back to intro" @action="phase = 'intro'" />

            <div v-else-if="phase === 'running' && currentItem" class="surface space-y-5 p-6">
                <div class="flex items-center justify-between gap-3">
                    <ActivityBar v-if="progress" :current="progress.answered" :total="progress.budget" />
                    <button type="button" class="btn-ghost shrink-0 text-sm" @click="pauseAndLeave">Pause</button>
                </div>
                <p class="eyebrow">{{ currentSkill }} · {{ currentItem.cefrLevel }}</p>

                <div v-if="currentItem.type === 'multiple-choice'" class="space-y-2">
                    <p class="text-lg font-medium text-gray-900">{{ currentItem.prompt }}</p>
                    <button
                        v-for="(option, index) in currentItem.options"
                        :key="index"
                        type="button"
                        class="choice w-full"
                        :class="choiceIndex === index ? 'choice-selected' : ''"
                        :disabled="!!revealed"
                        @click="choiceIndex = index"
                    >
                        {{ option }}
                    </button>
                </div>

                <div v-else-if="currentItem.type === 'fill-blank'" class="space-y-3">
                    <p class="wrap-anywhere text-lg leading-relaxed text-gray-900" dir="ltr">
                        {{ currentItem.before }}<span class="mx-1 inline-block min-w-20 border-b-2 border-accent" />{{ currentItem.after }}
                    </p>
                    <input v-model="textAnswer" type="text" class="field" :disabled="!!revealed" placeholder="Type the missing word…" dir="ltr" />
                </div>

                <div v-else-if="currentItem.type === 'short-answer'" class="space-y-3">
                    <p class="text-lg font-medium text-gray-900">{{ currentItem.prompt }}</p>
                    <input v-model="textAnswer" type="text" class="field" :disabled="!!revealed" dir="ltr" />
                </div>

                <div v-else-if="currentItem.type === 'grammar-correction'" class="space-y-3">
                    <p class="text-sm text-gray-500">Correct this sentence:</p>
                    <p class="wrap-anywhere text-lg text-gray-900" dir="ltr">{{ currentItem.incorrectSentence }}</p>
                    <input v-model="textAnswer" type="text" class="field" :disabled="!!revealed" dir="ltr" />
                </div>

                <div v-else-if="currentItem.type === 'sentence-ordering'" class="space-y-2">
                    <p class="text-sm text-gray-500">Tap the words in the correct order:</p>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="(position, slot) in orderIndices"
                            :key="slot"
                            type="button"
                            class="chip"
                            :disabled="!!revealed"
                            @click="orderIndices = orderIndices.filter((_, i) => i !== slot).concat(position)"
                        >
                            {{ currentItem.segments?.[position] }}
                        </button>
                    </div>
                </div>

                <div v-else-if="currentItem.type === 'matching'" class="space-y-3">
                    <div v-for="(left, leftIndex) in currentItem.pairsLeft" :key="leftIndex" class="flex items-center gap-3">
                        <span class="w-32 shrink-0 text-sm text-gray-700">{{ left }}</span>
                        <select v-model.number="matchSelections[leftIndex]" class="field" :disabled="!!revealed">
                            <option :value="null">Choose…</option>
                            <option v-for="(right, rightIndex) in currentItem.pairsRight" :key="rightIndex" :value="rightIndex">{{ right }}</option>
                        </select>
                    </div>
                </div>

                <AnswerFeedback v-if="revealed" :correct="revealed.correct" />

                <button
                    v-if="!revealed"
                    type="button"
                    class="btn-primary btn-lg w-full"
                    :disabled="!canSubmit || loading"
                    @click="submit"
                >
                    Check
                </button>
                <button v-else type="button" class="btn-primary btn-lg w-full" :disabled="loading" @click="continueAfterFeedback">
                    Continue
                </button>
            </div>

            <div v-else-if="phase === 'result'" class="space-y-5">
                <div v-for="skill in PLACEMENT_SKILLS" :key="skill" class="surface p-6">
                    <p class="eyebrow">{{ skill }}</p>
                    <h2 class="mt-1 text-2xl font-bold text-gray-900">
                        {{ results[skill]?.level ?? 'Not enough evidence yet' }}
                    </h2>
                    <p v-if="results[skill]?.level" class="mt-1 text-sm text-gray-500">
                        {{ confidenceLabel(results[skill]!.confidence) }}
                    </p>

                    <div v-if="skillProfileStore.profile.skills[skill].strengths.length" class="mt-4">
                        <p class="label">Strengths</p>
                        <ul class="mt-1 list-inside list-disc text-sm text-gray-700">
                            <li v-for="item in skillProfileStore.profile.skills[skill].strengths" :key="item">{{ item }}</li>
                        </ul>
                    </div>
                    <div v-if="skillProfileStore.profile.skills[skill].weaknesses.length" class="mt-3">
                        <p class="label">Areas to improve</p>
                        <ul class="mt-1 list-inside list-disc text-sm text-gray-700">
                            <li v-for="item in skillProfileStore.profile.skills[skill].weaknesses" :key="item">{{ item }}</li>
                        </ul>
                    </div>
                </div>

                <div class="surface p-6">
                    <p class="label">Not yet assessed</p>
                    <p class="mt-1 text-sm text-gray-500">
                        We don't have placement content for {{ NOT_YET_ASSESSED_SKILLS.join(', ') }} yet.
                        Your starting point for those uses your own self-assessment until we do.
                    </p>
                </div>

                <div class="surface p-6">
                    <p class="label">Recommended next step</p>
                    <p class="mt-1 text-base text-gray-900">{{ roadmapStage?.title ?? 'Everyday Foundations' }}</p>
                    <p class="mt-1 text-sm text-gray-500">{{ roadmapStage?.description }}</p>
                    <button type="button" class="btn-primary btn-lg mt-4" @click="finishAndGoToDashboard">Go to dashboard</button>
                </div>
            </div>

            <StateBlock v-else-if="loading" kind="loading" title="Loading…" />
        </div>
    </div>
</template>
