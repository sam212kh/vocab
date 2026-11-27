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
import { buildRoadmap, currentRoadmapStage } from '../services/roadmap'
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
const { locale, t } = useLocale()

const formatNumber = (value: number) => new Intl.NumberFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US').format(value)
const roadmapKey = (id: string, part: 'title' | 'description') => `dashboard.roadmap.${id}.${part}`
const milestoneKey = (id: string, part: 'title' | 'description') => `dashboard.milestone.${id}.${part}`
const activityLabel = (activity: { label: string; labelKey?: string }) => activity.labelKey ? t(activity.labelKey) : activity.label
const activityReason = (activity: { reason: string; reasonKey?: string; reasonParams?: Record<string, string> }) => activity.reasonKey ? t(activity.reasonKey, activity.reasonParams ?? {}) : activity.reason

const activityTitleKeys: Record<string, string> = {
    'Sentence building': 'dashboard.activity.sentenceBuilding',
    'New-situation sentence': 'dashboard.activity.newSituationSentence',
    'Word recall': 'dashboard.activity.wordRecall',
    'Recognition quiz': 'dashboard.activity.recognitionQuiz',
    'Grammar in context': 'dashboard.activity.grammarInContext',
    Dictation: 'dashboard.activity.dictation',
    'Daily Journey': 'dashboard.activity.dailyJourney',
    'Real-Life English': 'dashboard.activity.realLifeEnglish',
    'Career English': 'dashboard.activity.careerEnglish',
}
const skillKeys: Record<string, string> = {
    Vocabulary: 'dashboard.vocabulary', Grammar: 'dashboard.activity.grammar', Listening: 'dashboard.activity.listening',
    Speaking: 'dashboard.activity.guidedSpeaking', Reading: 'dashboard.activity.reading', Writing: 'dashboard.activity.writing',
}
const localizedRelativeTime = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000)
    if (locale.value === 'en') return relativeTime(timestamp)
    if (minutes < 1) return 'همین حالا'
    if (minutes < 60) return `${formatNumber(minutes)} دقیقه پیش`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${formatNumber(hours)} ساعت پیش`
    const days = Math.floor(hours / 24)
    return days === 1 ? 'دیروز' : `${formatNumber(days)} روز پیش`
}

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
    { label: t('dashboard.status.new'), value: count('new'), bar: 'bg-gray-300', dot: 'bg-gray-300' },
    { label: t('dashboard.status.learning'), value: count('learning'), bar: 'bg-amber-200', dot: 'bg-amber-200' },
    { label: t('dashboard.status.reviewing'), value: count('reviewing'), bar: 'bg-blue-600/70', dot: 'bg-blue-600/70' },
    { label: t('dashboard.status.mastered'), value: count('mastered'), bar: 'bg-learn-500', dot: 'bg-learn-500' },
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

const roadmap = computed(() =>
    buildRoadmap({
        evidence: journeyStore.evidence,
        completedJourneys: journeyStore.completedJourneyCount,
        availableSources: ['vocabulary', 'grammar', 'real-life', 'career', 'conversation'],
    })
)

const roadmapStage = computed(() => currentRoadmapStage(roadmap.value))
const firstRoadmapStageCompleted = computed(() => roadmap.value[0]?.state === 'completed')

const earnedMilestoneIds = computed(() =>
    evaluateMilestones({
        completedJourneyCount: journeyStore.completedJourneyCount,
        distinctIndependentlyKnownCount: distinctIndependentlyKnownCount.value,
        streakDays: currentStreak.value,
        hasHadConversation: conversationsStore.endedSessions.length > 0,
        hasCompletedFirstRoadmapStage: firstRoadmapStageCompleted.value,
    })
)

const milestoneRows = computed(() => MILESTONES.map(def => ({
    ...def,
    title: t(milestoneKey(def.id, 'title')),
    description: t(milestoneKey(def.id, 'description')),
    earned: earnedMilestoneIds.value.includes(def.id),
})))

onMounted(() => {
    /* Celebrate anything earned since the learner was last here — once per milestone, ever. */
    for (const id of earnedMilestoneIds.value) {
        if (gamificationStore.isSeen(id)) continue

        gamificationStore.markSeen(id)
        const def = MILESTONES.find(item => item.id === id)
        if (def) useToastStore().push(`🎉 ${t(milestoneKey(def.id, 'title'))}`, 'success')
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

/* One primary curriculum action. The existing bookmark resumes the exact
 * expression; a new learner starts at the first real A1 lesson. */
const continueLearningRoute = computed(() => {
    const lesson = lastLesson.value
    return lesson
        ? `/courses/${lesson.courseId}/lessons/${lesson.lessonId}?w=${lesson.index + 1}`
        : '/courses/oxford-elementary/lessons/oxford-elementary-01'
})

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
const greeting = computed(() => t(now.getHours() < 12 ? 'dashboard.greeting.morning' : now.getHours() < 18 ? 'dashboard.greeting.afternoon' : 'dashboard.greeting.evening'))
const dateLabel = computed(() => now.toLocaleDateString(
    locale.value === 'fa' ? 'fa-IR' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' },
))

const QUICK = [
    { labelKey: 'nav.lessons', to: '/lessons', icon: 'book' },
    { labelKey: 'nav.review', to: '/review', icon: 'repeat' },
    { labelKey: 'nav.hardWords', to: '/hard-words', icon: 'star' },
    { labelKey: 'nav.speakingPractice', to: '/speaking-practice', icon: 'mic' },
    { labelKey: 'nav.progress', to: '/progress', icon: 'chart' },
]
</script>

<template>
    <div class="mx-auto max-w-6xl space-y-6 sm:space-y-7">
        <PageHeader :eyebrow="dateLabel" :title="greeting" serif>
            <span
                v-if="currentStreak"
                class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-700"
                :title="t('dashboard.streakTitle', { count: formatNumber(currentStreak) })"
            >
                <AppIcon name="bolt" :size="16" /> {{ t('dashboard.streakInRow', { count: formatNumber(currentStreak), plural: currentStreak === 1 ? '' : 's' }) }}
            </span>
        </PageHeader>

        <RouterLink
            v-if="roadmapStage"
            to="/learning-path"
            class="surface flex items-center gap-3 p-4 transition hover:border-accent/40"
        >
            <AppIcon name="compass" :size="18" class="shrink-0 text-accent" />
            <span class="min-w-0 flex-1">
                <span class="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">{{ t('dashboard.learningPath') }}</span>
                <span class="block truncate text-sm font-medium text-gray-900">{{ t(roadmapKey(roadmapStage.id, 'title')) }} — {{ t(roadmapKey(roadmapStage.id, 'description')) }}</span>
            </span>
            <AppIcon name="chevron-right" :size="16" class="shrink-0 text-gray-300" />
        </RouterLink>

        <!-- Today's goal: ONE primary next action, not a row of equal-weight cards -->
        <section :aria-label="t('dashboard.todaysGoal')">
            <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2c3f66] via-[#243350] to-[#19243b] p-6 text-white shadow-md sm:p-8">
                <div class="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div class="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/[0.06]" />
                    <div class="absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-learn-500/20" />
                    <div class="absolute right-5 top-1/2 hidden h-24 w-24 lg:block -translate-y-1/2 rounded-3xl border border-white/15 bg-white/[0.07] sm:block" />
                    <div class="absolute right-20 top-10 hidden h-3 w-3 rounded-full bg-amber-200/80 lg:block" />
                </div>

                <div class="relative max-w-md">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{{ activeJourney ? t('dashboard.inProgress') : t('dashboard.todaysGoal') }}</p>
                    <h2 class="font-display mt-2 text-[1.75rem] font-semibold leading-tight sm:text-4xl">
                        {{ activeJourney ? t('dashboard.pickUp') : t('dashboard.learnRecallUse') }}
                    </h2>
                    <p class="mt-2 text-[0.95rem] leading-relaxed text-white/75">
                        <template v-if="activeJourney">{{ t('dashboard.journeySummary', { done: formatNumber(activeJourney.done), total: formatNumber(activeJourney.total), minutes: formatNumber(activeJourney.minutes) }) }}</template>
                        <template v-else>{{ t('dashboard.emptyJourney') }}</template>
                    </p>

                    <div v-if="activeJourney" class="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" :aria-valuenow="activeJourney.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="t('dashboard.journeyProgress')">
                        <div class="h-full rounded-full bg-white/80" :style="{ width: `${Math.max(activeJourney.percent, 4)}%` }" />
                    </div>

                    <RouterLink
                        :to="continueLearningRoute"
                        class="btn btn-lg mt-6 bg-white !text-[#243350] shadow-sm hover:bg-gray-100"
                    >
                        {{ lastLesson ? t('dashboard.continueLearning') : t('dashboard.startFirstLesson') }}
                        <AppIcon name="chevron-right" :size="18" />
                    </RouterLink>
                </div>
            </div>
        </section>

        <!-- Or continue with: due reviews, an in-progress lesson, one recommended activity -- secondary to the hero above, never competing with it for attention -->
        <section class="surface p-5 sm:p-6" :aria-label="t('dashboard.otherThings')">
            <p class="label">{{ t('dashboard.continueWith') }}</p>

            <ul class="mt-3 divide-y divide-gray-100">
                <li>
                    <RouterLink :to="dueWords ? '/session' : '/lessons'" class="group flex min-h-14 items-center gap-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-lg">
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 group-hover:bg-accent-soft group-hover:text-accent-ink"><AppIcon name="repeat" /></span>
                        <span class="min-w-0 flex-1">
                            <span class="block font-semibold text-gray-900">{{ dueWords ? t(dueWords === 1 ? 'dashboard.reviewDueOne' : 'dashboard.reviewDueMany', { count: formatNumber(dueWords) }) : t('dashboard.reviewsUpToDate') }}</span>
                            <span class="mt-0.5 block text-sm leading-snug text-gray-500">{{ dueWords ? t('dashboard.shortReviews') : t('dashboard.learnNewWords') }}</span>
                        </span>
                        <AppIcon name="chevron-right" :size="16" class="shrink-0 text-gray-300 group-hover:text-accent" />
                    </RouterLink>
                </li>

                <li v-if="lastLesson">
                    <RouterLink :to="lastLessonLink" class="group flex min-h-14 items-center gap-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-lg">
                        <div class="h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200/80" aria-hidden="true">
                            <LearningIllustration :seed="`${lastLesson.courseId}/${lastLesson.lessonId}`" />
                        </div>
                        <span class="min-w-0 flex-1">
                            <span class="wrap-anywhere block font-semibold text-gray-900 group-hover:text-learn-700">{{ lastLesson.title }}</span>
                            <span class="mt-0.5 block text-sm text-gray-500">{{ t('dashboard.continueExpression', { current: formatNumber(lastLesson.index + 1), total: formatNumber(lastLesson.total) }) }}</span>
                        </span>
                        <AppIcon name="chevron-right" :size="16" class="shrink-0 text-gray-300 group-hover:text-learn-600" />
                    </RouterLink>
                </li>

                <li v-if="nextAction">
                    <RouterLink :to="nextAction.route" class="group flex min-h-14 items-center gap-3.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-lg">
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 group-hover:bg-accent-soft group-hover:text-accent-ink"><AppIcon :name="iconForRoute(nextAction.route)" /></span>
                        <span class="min-w-0 flex-1">
                            <span class="block font-semibold text-gray-900">{{ activityLabel(nextAction) }}</span>
                            <span class="mt-0.5 block text-sm leading-snug text-gray-500">{{ activityReason(nextAction) }}</span>
                        </span>
                        <span class="shrink-0 text-xs text-gray-400">{{ t('dashboard.minutesShort', { minutes: formatNumber(nextAction.estimatedMinutes) }) }}</span>
                    </RouterLink>
                </li>

                <li v-for="item in otherActions" :key="item.type">
                    <RouterLink :to="item.route" class="flex min-h-12 items-center gap-3 rounded-lg px-1 text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                        <AppIcon :name="iconForRoute(item.route)" :size="17" class="text-gray-400" />
                        <span class="flex-1 truncate">{{ activityLabel(item) }}</span>
                        <span class="text-xs text-gray-400">{{ t('dashboard.minutesShort', { minutes: formatNumber(item.estimatedMinutes) }) }}</span>
                    </RouterLink>
                </li>
            </ul>

            <RouterLink v-if="!lastLesson" to="/lessons" class="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-learn-700 hover:text-learn-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                {{ t('dashboard.browseLessons') }} <AppIcon name="chevron-right" :size="16" />
            </RouterLink>
        </section>

        <!-- Daily progress: streak, XP and milestones -->
        <section class="surface p-5 sm:p-6" :aria-label="t('dashboard.dailyProgress')">
            <p class="label">{{ t('dashboard.dailyProgress') }}</p>

            <div class="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4">
            <div class="flex items-center gap-2.5">
                <AppIcon name="bolt" :size="22" class="text-amber-500" />
                <div>
                    <p class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ currentStreak }}</p>
                    <p class="text-xs text-gray-400">{{ t('dashboard.dayStreak') }}</p>
                </div>
            </div>
            <div class="flex items-center gap-2.5">
                <AppIcon name="star" :size="22" class="text-accent" />
                <div>
                    <p class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ xp.total }}</p>
                    <p class="text-xs text-gray-400">{{ t('dashboard.xpEarned') }}</p>
                </div>
            </div>
            <ul class="flex flex-wrap gap-2" :aria-label="t('dashboard.milestones')">
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
            </div>
        </section>

        <!-- Skill progress + recent activity -->
        <section class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" :aria-label="t('dashboard.skillProgress')">
            <div class="surface p-5 sm:p-6">
                <p class="label">{{ t('dashboard.vocabulary') }}</p>

                <StateBlock v-if="!totalWords" kind="empty" :title="t('dashboard.noWords')" :text="t('dashboard.wordsPrompt')" class="mt-3 !shadow-none">
                    <RouterLink to="/lessons" class="btn-primary mt-4">{{ t('dashboard.openLesson') }}</RouterLink>
                </StateBlock>

                <template v-else>
                    <div class="mt-3 flex items-end justify-between gap-4">
                        <p class="font-display text-4xl font-semibold tabular-nums text-gray-900">{{ formatNumber(totalWords) }}<span class="ml-1.5 text-base font-normal text-gray-400">{{ t('dashboard.wordsTracked') }}</span></p>
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
                            <dt class="text-xs text-gray-400">{{ t('dashboard.answerAccuracy') }}</dt>
                            <dd class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ totalAnswers ? `${accuracy}%` : '—' }}</dd>
                        </div>
                        <div>
                            <dt class="text-xs text-gray-400">{{ t('dashboard.mastered') }}</dt>
                            <dd class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ masteryPercent }}%</dd>
                        </div>
                    </dl>
                </template>
            </div>

            <div class="surface p-5 sm:p-6">
                <p class="label">{{ t('dashboard.recentActivity') }}</p>

                <StateBlock v-if="!activity.length" kind="empty" :title="t('dashboard.noActivity')" :text="t('dashboard.finishExercise')" class="mt-3 !shadow-none" />

                <ul v-else class="mt-2 divide-y divide-gray-100">
                    <li v-for="row in activity" :key="row.id" class="flex items-center gap-3 py-2.5">
                        <span
                            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            :class="row.correct ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'"
                            :aria-label="row.correct ? t('dashboard.correct') : t('dashboard.needsReview')"
                        ><AppIcon :name="row.correct ? 'check' : 'close'" :size="14" /></span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-gray-900">{{ activityTitleKeys[row.title] ? t(activityTitleKeys[row.title]) : row.title }}</span>
                            <span class="block truncate text-xs text-gray-400">{{ skillKeys[row.skill] ? t(skillKeys[row.skill]) : row.skill }}<template v-if="!row.correct && row.detail"> · {{ row.detail }}</template></span>
                        </span>
                        <span class="shrink-0 text-xs text-gray-400">{{ localizedRelativeTime(row.at) }}</span>
                    </li>
                </ul>
            </div>
        </section>

        <!-- Quick access -->
        <nav class="flex flex-wrap gap-2 pb-2" :aria-label="t('dashboard.quickAccess')">
            <RouterLink v-for="item in QUICK" :key="item.to" :to="item.to" class="btn-secondary gap-2 rounded-full">
                <AppIcon :name="item.icon" :size="16" class="text-gray-400" /> {{ t(item.labelKey) }}
            </RouterLink>
        </nav>
    </div>
</template>
