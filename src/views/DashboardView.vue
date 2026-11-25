<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/ui/AppIcon.vue'
import LearningIllustration from '../components/art/LearningIllustration.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import StateBlock from '../components/ui/StateBlock.vue'

import { useWordProgressStore } from '../stores/wordProgress'
import { useHardWordsStore } from '../stores/hardWords'
import { useLearnerProfileStore } from '../stores/learnerProfile'
import { useGrammarProgressStore } from '../stores/grammarProgress'
import { usePerformanceStore } from '../stores/performance'
import { useMistakesStore } from '../stores/mistakes'
import { useJourneyStore } from '../stores/journey'
import { useLearningPositionStore } from '../stores/learningPosition'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { useConversationsStore } from '../stores/conversations'
import { useGamificationStore } from '../stores/gamification'

import { buildDailyRecommendation } from '../services/learningRecommendation'
import { recentActivity, relativeTime } from '../services/recentActivity'
import { useLocale } from '../services/locale'
import { computeStreak } from '../services/streak'
import { computeXp } from '../services/xp'
import { MILESTONES, evaluateMilestones } from '../services/milestones'
import { buildRoadmap } from '../services/roadmap'
import { useToastStore } from '../stores/toast'

const wordProgressStore = useWordProgressStore()
const hardWordsStore = useHardWordsStore()
const learnerProfileStore = useLearnerProfileStore()
const grammarProgressStore = useGrammarProgressStore()
const performanceStore = usePerformanceStore()
const mistakesStore = useMistakesStore()
const journeyStore = useJourneyStore()
const positionStore = useLearningPositionStore()
const learningEvidenceStore = useLearningEvidenceStore()
const conversationsStore = useConversationsStore()
const gamificationStore = useGamificationStore()
const { locale } = useLocale()

const recommendation = computed(() =>
    buildDailyRecommendation({
        studyDurationMinutes: learnerProfileStore.profile.studyDurationMinutes,
        dueWordsCount: wordProgressStore.getDueWords().length,
        hardWordsCount: hardWordsStore.hardWords.length,
        goals: learnerProfileStore.profile.goals.map(goal => goal.type),
        dueGrammarTopics: grammarProgressStore.getDueTopics().map(topic => topic.topicId),
        skillSummaries: performanceStore.summarizeAll(),
        recurringWritingErrorCategories: mistakesStore.recurringErrorCategories(),
    })
)

const progress = computed(() => wordProgressStore.progress)
const totalWords = computed(() => progress.value.length)
const dueWords = computed(() => wordProgressStore.getDueWords().length)

function count(status: string) {
    return progress.value.filter(item => item.status === status).length
}

const statusItems = computed(() => [
    { label: 'New', value: count('new'), bar: 'bg-gray-300', dot: 'bg-gray-300' },
    { label: 'Learning', value: count('learning'), bar: 'bg-amber-200', dot: 'bg-amber-200' },
    { label: 'Reviewing', value: count('reviewing'), bar: 'bg-blue-600/70', dot: 'bg-blue-600/70' },
    { label: 'Mastered', value: count('mastered'), bar: 'bg-learn-500', dot: 'bg-learn-500' },
])

const totalCorrect = computed(() => progress.value.reduce((sum, item) => sum + item.correctAnswers, 0))
const totalAnswers = computed(() => totalCorrect.value + progress.value.reduce((sum, item) => sum + item.wrongAnswers, 0))
const accuracy = computed(() => (totalAnswers.value ? Math.round((totalCorrect.value / totalAnswers.value) * 100) : 0))
const masteryPercent = computed(() => (totalWords.value ? Math.round((count('mastered') / totalWords.value) * 100) : 0))

/*
 * Every source of real activity, not just word reviews — a learner who
 * only did a Daily Journey or a grammar review yesterday still kept their
 * streak. computeStreak() also doesn't reset to 0 the instant a new day
 * starts before you've studied yet (Phase 11.6: streaks shouldn't punish,
 * and "today has nothing yet" isn't the same as "the streak broke").
 */
const currentStreak = computed(() =>
    computeStreak([
        ...progress.value.map(item => item.lastReviewedAt).filter((ts): ts is number => ts !== null),
        ...grammarProgressStore.progress.map(item => item.lastPracticedAt).filter((ts): ts is number => ts !== null),
        ...journeyStore.sessions.map(session => session.completedAt).filter((ts): ts is number => ts !== null),
    ])
)

const xp = computed(() => computeXp(learningEvidenceStore.items, journeyStore.completedJourneyCount))

const distinctIndependentlyKnownCount = computed(() =>
    Object.values(learningEvidenceStore.items).filter(
        item => item.counts.recall.independentSuccess > 0 || item.counts.production.independentSuccess > 0
    ).length
)

const firstRoadmapStageCompleted = computed(() => {
    const stages = buildRoadmap({
        evidence: journeyStore.evidence,
        completedJourneys: journeyStore.completedJourneyCount,
        availableSources: ['vocabulary', 'grammar', 'real-life', 'career', 'conversation'],
    })

    return stages[0]?.state === 'completed'
})

const earnedMilestoneIds = computed(() =>
    evaluateMilestones({
        completedJourneyCount: journeyStore.completedJourneyCount,
        distinctIndependentlyKnownCount: distinctIndependentlyKnownCount.value,
        streakDays: currentStreak.value,
        hasHadConversation: conversationsStore.endedSessions.length > 0,
        hasCompletedFirstRoadmapStage: firstRoadmapStageCompleted.value,
    })
)

const milestoneRows = computed(() => MILESTONES.map(def => ({ ...def, earned: earnedMilestoneIds.value.includes(def.id) })))

onMounted(() => {
    /* Celebrate anything earned since the learner was last here — once per milestone, ever. */
    for (const id of earnedMilestoneIds.value) {
        if (gamificationStore.isSeen(id)) continue

        gamificationStore.markSeen(id)
        const def = MILESTONES.find(item => item.id === id)
        if (def) useToastStore().push(`🎉 ${def.title}`, 'success')
    }
})

/* Daily Journey: resume an interrupted one, otherwise offer a fresh start. */
const activeJourney = computed(() => {
    const session = journeyStore.activeSession

    if (!session) return null

    const total = session.plan.activities.length
    const done = Object.values(session.statuses).filter(status => status !== 'pending').length

    return { done, total, minutes: session.plan.totalEstimatedMinutes, percent: total ? Math.round((done / total) * 100) : 0 }
})

const lastLesson = computed(() => positionStore.last)

const lastLessonLink = computed(() => {
    const lesson = lastLesson.value

    if (!lesson) return '/lessons'

    return `/courses/${lesson.courseId}/lessons/${lesson.lessonId}${lesson.index > 0 ? `?w=${lesson.index + 1}` : ''}`
})

const activity = computed(() => recentActivity(performanceStore.events, 6))

const ROUTE_ICON: Record<string, string> = {
    '/session': 'bolt',
    '/grammar': 'layers',
    '/listening': 'headphones',
    '/guided-speaking': 'mic',
    '/reading': 'book',
    '/writing': 'pen',
}

const iconForRoute = (route: string) => ROUTE_ICON[route] ?? 'sparkle'

const nextAction = computed(() => recommendation.value.activities[0] ?? null)
const otherActions = computed(() => recommendation.value.activities.slice(1, 5))

const now = new Date()
const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
const dateLabel = computed(() => now.toLocaleDateString(
    locale.value === 'fa' ? 'fa-IR' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' },
))

const QUICK = [
    { label: 'Lessons', to: '/lessons', icon: 'book' },
    { label: 'Review', to: '/review', icon: 'repeat' },
    { label: 'Hard words', to: '/hard-words', icon: 'star' },
    { label: 'Speaking', to: '/speaking-practice', icon: 'mic' },
    { label: 'Progress', to: '/progress', icon: 'chart' },
]
</script>

<template>
    <div class="mx-auto max-w-6xl space-y-6 sm:space-y-7">
        <PageHeader :eyebrow="dateLabel" :title="greeting" serif>
            <span
                v-if="currentStreak"
                class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-700"
                :title="`${currentStreak} day streak`"
            >
                <AppIcon name="bolt" :size="16" /> {{ currentStreak }} day{{ currentStreak === 1 ? '' : 's' }} in a row
            </span>
        </PageHeader>

        <!-- Today: the journey (primary) + spaced review -->
        <section class="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]" aria-label="Today">
            <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2c3f66] via-[#243350] to-[#19243b] p-6 text-white shadow-md sm:p-8">
                <div class="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div class="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/[0.06]" />
                    <div class="absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-learn-500/20" />
                    <div class="absolute right-5 top-1/2 hidden h-24 w-24 lg:block -translate-y-1/2 rounded-3xl border border-white/15 bg-white/[0.07] sm:block" />
                    <div class="absolute right-20 top-10 hidden h-3 w-3 rounded-full bg-amber-200/80 lg:block" />
                </div>

                <div class="relative max-w-md">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{{ activeJourney ? 'In progress' : "Today's journey" }}</p>
                    <h2 class="font-display mt-2 text-[1.75rem] font-semibold leading-tight sm:text-4xl">
                        {{ activeJourney ? 'Pick up where you left off' : 'Learn it, recall it, then use it' }}
                    </h2>
                    <p class="mt-2 text-[0.95rem] leading-relaxed text-white/75">
                        <template v-if="activeJourney">{{ activeJourney.done }} of {{ activeJourney.total }} activities done · about {{ activeJourney.minutes }} minutes in total.</template>
                        <template v-else>A session built around what you need today: recognition, retrieval, and real sentences. 5, 18 or 40 minutes.</template>
                    </p>

                    <div v-if="activeJourney" class="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" :aria-valuenow="activeJourney.percent" aria-valuemin="0" aria-valuemax="100" aria-label="Journey progress">
                        <div class="h-full rounded-full bg-white/80" :style="{ width: `${Math.max(activeJourney.percent, 4)}%` }" />
                    </div>

                    <RouterLink
                        to="/daily-journey"
                        class="btn btn-lg mt-6 bg-white !text-[#243350] shadow-sm hover:bg-gray-100"
                    >
                        {{ activeJourney ? 'Resume journey' : 'Start today\'s journey' }}
                        <AppIcon name="chevron-right" :size="18" />
                    </RouterLink>
                </div>
            </div>

            <div class="surface flex flex-col p-6">
                <p class="label">Spaced review</p>
                <p class="font-display mt-2 text-6xl font-semibold leading-none tabular-nums text-gray-900">{{ dueWords }}</p>
                <p class="mt-2 text-sm text-gray-500">
                    {{ dueWords ? `word${dueWords === 1 ? '' : 's'} ready for review. Short reviews keep them in memory.` : 'Nothing due — your reviews are up to date.' }}
                </p>
                <div class="mt-auto pt-5">
                    <RouterLink v-if="dueWords" to="/session" class="btn-primary btn-lg w-full">Review now</RouterLink>
                    <RouterLink v-else to="/lessons" class="btn-secondary btn-lg w-full">Learn new words</RouterLink>
                </div>
            </div>
        </section>

        <!-- Continue + recommended -->
        <section class="grid gap-5 lg:grid-cols-2" aria-label="Next steps">
            <div class="surface flex flex-col p-5 sm:p-6">
                <p class="label">Continue learning</p>

                <RouterLink v-if="lastLesson" :to="lastLessonLink" class="group mt-3 flex items-center gap-4 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
                    <div class="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200/80" aria-hidden="true">
                        <LearningIllustration :seed="`${lastLesson.courseId}/${lastLesson.lessonId}`" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="wrap-anywhere font-display text-lg font-semibold leading-snug text-gray-900 group-hover:text-learn-700">{{ lastLesson.title }}</p>
                        <p class="mt-0.5 text-sm text-gray-500">Expression {{ lastLesson.index + 1 }} of {{ lastLesson.total }}</p>
                        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div class="h-full rounded-full bg-learn-500" :style="{ width: `${Math.round(((lastLesson.index + 1) / lastLesson.total) * 100)}%` }" />
                        </div>
                    </div>
                    <AppIcon name="chevron-right" class="text-gray-300 group-hover:text-learn-600" />
                </RouterLink>

                <div v-else class="mt-3">
                    <p class="text-sm text-gray-500">No lesson in progress. Open one to start building your vocabulary.</p>
                </div>

                <RouterLink to="/lessons" class="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-4 text-sm font-semibold text-learn-700 hover:text-learn-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    {{ lastLesson ? 'Browse all lessons' : 'Browse lessons' }} <AppIcon name="chevron-right" :size="16" />
                </RouterLink>
            </div>

            <div class="surface p-5 sm:p-6">
                <div class="flex items-baseline justify-between">
                    <p class="label">Recommended for you</p>
                    <span class="text-xs text-gray-400">~{{ recommendation.totalEstimatedMinutes }} min</span>
                </div>

                <RouterLink
                    v-if="nextAction"
                    :to="nextAction.route"
                    class="group mt-3 flex items-start gap-3.5 rounded-2xl bg-accent-soft p-3.5 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                >
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-accent-ink shadow-sm"><AppIcon :name="iconForRoute(nextAction.route)" /></span>
                    <span class="min-w-0 flex-1">
                        <span class="block font-semibold text-gray-900">{{ nextAction.label }}</span>
                        <span class="mt-0.5 block text-sm leading-snug text-gray-500">{{ nextAction.reason }}</span>
                    </span>
                    <span class="shrink-0 text-xs text-gray-400">~{{ nextAction.estimatedMinutes }} min</span>
                </RouterLink>

                <ul v-if="otherActions.length" class="mt-2 divide-y divide-gray-100">
                    <li v-for="item in otherActions" :key="item.type">
                        <RouterLink :to="item.route" class="flex min-h-12 items-center gap-3 rounded-lg px-1 text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                            <AppIcon :name="iconForRoute(item.route)" :size="17" class="text-gray-400" />
                            <span class="flex-1 truncate">{{ item.label }}</span>
                            <span class="text-xs text-gray-400">~{{ item.estimatedMinutes }} min</span>
                        </RouterLink>
                    </li>
                </ul>
            </div>
        </section>

        <!-- Streak, XP and milestones -->
        <section class="surface flex flex-wrap items-center gap-x-8 gap-y-4 p-5 sm:p-6" aria-label="Streak and milestones">
            <div class="flex items-center gap-2.5">
                <AppIcon name="bolt" :size="22" class="text-amber-500" />
                <div>
                    <p class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ currentStreak }}</p>
                    <p class="text-xs text-gray-400">day streak</p>
                </div>
            </div>
            <div class="flex items-center gap-2.5">
                <AppIcon name="star" :size="22" class="text-accent" />
                <div>
                    <p class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ xp.total }}</p>
                    <p class="text-xs text-gray-400">XP earned</p>
                </div>
            </div>
            <ul class="flex flex-wrap gap-2" aria-label="Milestones">
                <li
                    v-for="milestone in milestoneRows"
                    :key="milestone.id"
                    class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                    :class="milestone.earned ? 'bg-accent-soft text-accent-ink' : 'bg-gray-100 text-gray-400'"
                    :title="milestone.description"
                >
                    <AppIcon :name="milestone.earned ? 'sparkle' : 'lock'" :size="13" />
                    {{ milestone.title }}
                </li>
            </ul>
        </section>

        <!-- Progress + recent activity -->
        <section class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-label="Progress">
            <div class="surface p-5 sm:p-6">
                <p class="label">Vocabulary</p>

                <StateBlock v-if="!totalWords" kind="empty" title="No words tracked yet" text="Words appear here once you practise them. Open a lesson, then practise it." class="mt-3 !shadow-none">
                    <RouterLink to="/lessons" class="btn-primary mt-4">Open a lesson</RouterLink>
                </StateBlock>

                <template v-else>
                    <div class="mt-3 flex items-end justify-between gap-4">
                        <p class="font-display text-4xl font-semibold tabular-nums text-gray-900">{{ totalWords }}<span class="ml-1.5 text-base font-normal text-gray-400">words tracked</span></p>
                    </div>

                    <div class="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-gray-100" role="img" :aria-label="statusItems.map(item => `${item.value} ${item.label}`).join(', ')">
                        <span v-for="item in statusItems" :key="item.label" class="h-full first:rounded-l-full last:rounded-r-full" :class="item.bar" :style="{ width: `${(item.value / totalWords) * 100}%` }" />
                    </div>

                    <ul class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                        <li v-for="item in statusItems" :key="item.label" class="flex items-center gap-2">
                            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="item.dot" />
                            <span class="text-gray-500">{{ item.label }}</span>
                            <span class="ml-auto font-semibold tabular-nums text-gray-900 sm:ml-0">{{ item.value }}</span>
                        </li>
                    </ul>

                    <dl class="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                        <div>
                            <dt class="text-xs text-gray-400">Answer accuracy</dt>
                            <dd class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ totalAnswers ? `${accuracy}%` : '—' }}</dd>
                        </div>
                        <div>
                            <dt class="text-xs text-gray-400">Mastered</dt>
                            <dd class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ masteryPercent }}%</dd>
                        </div>
                    </dl>
                </template>
            </div>

            <div class="surface p-5 sm:p-6">
                <p class="label">Recent activity</p>

                <StateBlock v-if="!activity.length" kind="empty" title="No activity yet" text="Finish an exercise and it shows up here." class="mt-3 !shadow-none" />

                <ul v-else class="mt-2 divide-y divide-gray-100">
                    <li v-for="row in activity" :key="row.id" class="flex items-center gap-3 py-2.5">
                        <span
                            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            :class="row.correct ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'"
                            :aria-label="row.correct ? 'Correct' : 'Needs review'"
                        ><AppIcon :name="row.correct ? 'check' : 'close'" :size="14" /></span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-gray-900">{{ row.title }}</span>
                            <span class="block truncate text-xs text-gray-400">{{ row.skill }}<template v-if="!row.correct && row.detail"> · {{ row.detail }}</template></span>
                        </span>
                        <span class="shrink-0 text-xs text-gray-400">{{ relativeTime(row.at) }}</span>
                    </li>
                </ul>
            </div>
        </section>

        <!-- Quick access -->
        <nav class="flex flex-wrap gap-2 pb-2" aria-label="Quick access">
            <RouterLink v-for="item in QUICK" :key="item.to" :to="item.to" class="btn-secondary gap-2 rounded-full">
                <AppIcon :name="item.icon" :size="16" class="text-gray-400" /> {{ item.label }}
            </RouterLink>
        </nav>
    </div>
</template>
