<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AppIcon from '../components/ui/AppIcon.vue'
import PageHeader from '../components/ui/PageHeader.vue'
import CompareBars from '../components/progress/CompareBars.vue'
import DimensionRow from '../components/progress/DimensionRow.vue'

import { useJourneyStore } from '../stores/journey'
import { useLearningEvidenceStore } from '../stores/learningEvidence'
import { usePerformanceStore } from '../stores/performance'
import { useWordProgressStore } from '../stores/wordProgress'

import { lexKey } from '../services/evidenceBridge'
import { generateInsights } from '../services/insights'
import { computeIntelligence } from '../services/learningIntelligence'
import { buildProgressOverview } from '../services/progressOverview'
import { relativeTime } from '../services/recentActivity'
import { RETENTION_HORIZONS } from '../services/retention'
import { loadTransferPatterns } from '../services/transferContent'
import { attemptsFromLedger, patternProgress } from '../services/transfer'
import { vocabularyMastery } from '../services/vocabularyMastery'
import { COMMUNICATION_METRICS } from '../services/communicationProgress'

import type { TransferPattern } from '../types/transfer'
import type { GapDimension } from '../types/skillGap'
import { useLocale } from '../services/locale'

const ledger = useLearningEvidenceStore()
const performanceStore = usePerformanceStore()
const journeyStore = useJourneyStore()
const wordProgressStore = useWordProgressStore()
const { locale } = useLocale()

const patterns = ref<TransferPattern[]>([])
const now = Date.now()

onMounted(async () => {
    try {
        patterns.value = await loadTransferPatterns()
    } catch {
        patterns.value = []
    }
})

const items = computed(() => Object.values(ledger.items))

const intelligence = computed(() =>
    computeIntelligence({
        now,
        items: items.value,
        events: performanceStore.events,
        srs: wordProgressStore.progress.map(item => ({ key: lexKey(item.wordId), status: item.status, nextReviewAt: item.nextReviewAt })),
        patterns: patterns.value,
    })
)

const overview = computed(() => buildProgressOverview(journeyStore.sessions, now))
const insights = computed(() => generateInsights(intelligence.value.gaps, intelligence.value.retention))

const mastery = computed(() => {
    const due = new Set(wordProgressStore.getDueWords().map(item => lexKey(item.wordId)))
    const legacyOnly = new Set(items.value.filter(item => item.legacy && item.counts.recall.attempts + item.counts.recognition.attempts + item.counts.production.attempts === 0).map(item => item.key))

    return vocabularyMastery(intelligence.value.summaries, due, legacyOnly)
})

const dimension = (name: GapDimension) => intelligence.value.gaps.dimensions.find(item => item.dimension === name)!

const transfer = computed(() => {
    const attempts = attemptsFromLedger(items.value)

    return patterns.value.map(pattern => ({ pattern, progress: patternProgress(pattern.id, attempts) }))
})

const retention = computed(() => intelligence.value.retention)

const categories = computed(() => [
    { label: 'Newly introduced', value: mastery.value.newlyIntroduced, hint: 'Seen, not yet tested' },
    { label: 'Currently learning', value: mastery.value.currentlyLearning, hint: 'Recognized' },
    { label: 'Independently recalled', value: mastery.value.independentlyRecalled, hint: 'Typed from memory, on 2+ days' },
    { label: 'Independently produced', value: mastery.value.independentlyProduced, hint: 'Used in your own sentences' },
    { label: 'Used in new situations', value: mastery.value.usedInNewContexts, hint: 'Transferred to new contexts' },
    { label: 'Retained 7+ days', value: mastery.value.retained, hint: 'Still recalled after a week' },
])

const INSIGHT_DOT: Record<string, string> = { attention: 'bg-amber-500', progress: 'bg-green-600', strength: 'bg-green-600', info: 'bg-gray-400' }

const ratePercent = (rate: number | null) => (rate === null ? '—' : `${rate}%`)

const metrics = computed(() => [
    { label: 'Immediate success', hint: 'First unaided answer, same day', data: retention.value.metrics.immediateSuccess },
    { label: 'Delayed recall', hint: 'Unaided, a day or more later', data: retention.value.metrics.delayedRecall },
    { label: 'Independent production', hint: 'Words used in your own sentences', data: retention.value.metrics.independentProduction },
    { label: 'Contextual transfer', hint: 'Patterns used in new situations', data: retention.value.metrics.contextualTransfer },
])

const communicationMetrics = computed(() => COMMUNICATION_METRICS.map(metric => ({
    ...metric,
    result: dimension(metric.dimension),
})))

function communicationStatus(classification: ReturnType<typeof dimension>['classification']): string {
    if (locale.value === 'fa') {
        return {
            insufficient: 'نیازمند شواهد بیشتر',
            strength: 'نقطه قوت',
            developing: 'در حال پیشرفت',
            weakness: 'نیازمند تمرین',
        }[classification]
    }

    return classification === 'insufficient' ? 'Needs evidence' : classification
}
</script>

<template>
    <div class="mx-auto max-w-4xl space-y-6">
        <PageHeader
            eyebrow="Progress"
            title="What you have actually learned"
            serif
            description="Built only from answers you gave on your own. Hints, AI help and copied corrections are never counted as learning, and nothing here is a proficiency level."
            description-persian="فقط بر اساس پاسخ‌هایی که خودت داده‌ای. راهنمایی، کمک هوش مصنوعی و کپی‌کردن اصلاحات جزو یادگیری حساب نمی‌شود."
        />

        <!-- Insights -->
        <section class="surface p-5 sm:p-6" aria-labelledby="insights-title">
            <h2 id="insights-title" class="label">Insights</h2>

            <ul class="mt-3 divide-y divide-gray-100">
                <li v-for="insight in insights" :key="insight.id" class="py-3.5" :data-insight="insight.id">
                    <div class="flex gap-3">
                        <span class="mt-2 h-2 w-2 shrink-0 rounded-full" :class="INSIGHT_DOT[insight.kind]" aria-hidden="true" />
                        <div class="min-w-0 flex-1">
                            <p class="font-medium text-gray-900">{{ insight.text }}</p>
                            <p class="fa-text mt-0.5 text-sm text-gray-500" lang="fa">{{ insight.textPersian }}</p>

                            <details class="mt-1">
                                <summary class="inline-flex min-h-11 cursor-pointer items-center text-xs font-medium text-gray-500 hover:text-gray-800">Why am I seeing this?</summary>
                                <p class="pb-1 text-xs leading-relaxed text-gray-500">{{ insight.why }}</p>
                            </details>

                            <RouterLink v-if="insight.action" :to="insight.action.to" class="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-ink hover:underline">
                                {{ insight.action.label }} <AppIcon name="chevron-right" :size="15" />
                            </RouterLink>
                        </div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Overview -->
        <section class="surface p-5 sm:p-6" aria-labelledby="overview-title">
            <h2 id="overview-title" class="label">Learning activity</h2>

            <dl class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                    <dt class="text-xs text-gray-400">Daily Journeys completed</dt>
                    <dd class="font-display text-3xl font-semibold tabular-nums text-gray-900">{{ overview.completedSessions }}</dd>
                </div>
                <div>
                    <dt class="text-xs text-gray-400">Time in Daily Journeys</dt>
                    <dd class="font-display text-3xl font-semibold tabular-nums text-gray-900">{{ overview.minutesInJourneys }}<span class="ml-1 text-sm font-normal text-gray-400">min</span></dd>
                </div>
                <div class="col-span-2 sm:col-span-1">
                    <dt class="text-xs text-gray-400">Journeys per week (latest first)</dt>
                    <dd class="mt-1 flex items-end gap-2" aria-label="Completed journeys over the last four weeks">
                        <span v-for="(count, index) in overview.perWeek" :key="index" class="flex flex-col items-center gap-1">
                            <span class="w-6 rounded bg-accent/70" :style="{ height: `${6 + count * 10}px` }" />
                            <span class="text-xs tabular-nums text-gray-500">{{ count }}</span>
                        </span>
                    </dd>
                </div>
            </dl>
            <p class="mt-2 text-xs text-gray-400">Time covers Daily Journeys only (each capped at 90 minutes); other modules do not track time.</p>

            <ul v-if="overview.recent.length" class="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                <li v-for="session in overview.recent" :key="session.id" class="flex items-center gap-3 py-2.5 text-sm">
                    <span class="min-w-0 flex-1 truncate text-gray-700">{{ session.objective }}</span>
                    <span class="shrink-0 text-xs tabular-nums text-gray-400">{{ session.completedActivities }}/{{ session.totalActivities }} · {{ session.minutes }} min · {{ relativeTime(session.at) }}</span>
                </li>
            </ul>
        </section>

        <!-- Skills -->
        <section class="surface p-5 sm:p-6" aria-labelledby="skills-title">
            <h2 id="skills-title" class="label">Skill analysis</h2>
            <p class="mt-1 text-xs text-gray-400">A skill is only judged after 8 independent answers on 2 or more days. Target: 70%.</p>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <CompareBars title="Recognition vs recall" title-persian="تشخیص در برابر یادآوری" :left="{ label: 'Recognition', result: dimension('vocabRecognition') }" :right="{ label: 'Recall', result: dimension('vocabRecall') }" />
                <CompareBars title="Production vs fluency" title-persian="تولید در برابر روانی" :left="{ label: 'Sentence construction', result: dimension('sentenceConstruction') }" :right="{ label: 'Speaking fluency', result: dimension('speakingFluency') }" />
            </div>

            <ul class="mt-3 divide-y divide-gray-100">
                <DimensionRow v-for="result in intelligence.gaps.dimensions" :key="result.dimension" :result="result" />
            </ul>
        </section>

        <!-- Communication -->
        <section class="surface p-5 sm:p-6" aria-labelledby="communication-title">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <h2 id="communication-title" class="label">Communication evidence</h2>
                    <p class="fa-text mt-1 text-xs text-gray-400" lang="fa">شواهد ارتباطی</p>
                </div>
                <span class="text-xs text-gray-400">Observed evidence, not a fluency score</span>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <article
                    v-for="metric in communicationMetrics"
                    :key="metric.id"
                    class="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                    :data-communication-metric="metric.id"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h3 class="font-semibold text-gray-900">{{ metric.label }}</h3>
                            <p class="fa-text text-xs text-gray-400" lang="fa">{{ metric.labelPersian }}</p>
                        </div>
                        <span class="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-500">
                            {{ communicationStatus(metric.result.classification) }}
                        </span>
                    </div>

                    <p class="mt-3 text-xs leading-relaxed text-gray-500">{{ locale === 'fa' ? metric.notePersian : metric.note }}</p>
                    <p v-if="metric.result.estimate !== null" class="mt-2 text-sm font-semibold text-gray-800">
                        {{ metric.result.estimate }}% · {{ metric.result.observations }} independent observations
                    </p>
                    <p v-else class="mt-2 text-xs text-gray-400">
                        {{ metric.result.observations }} / 8 observations · no claim yet
                    </p>
                    <RouterLink
                        v-if="metric.result.recommendation"
                        :to="metric.result.recommendation.to"
                        class="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-ink hover:underline"
                    >
                        {{ metric.result.recommendation.label }} <AppIcon name="chevron-right" :size="15" />
                    </RouterLink>
                </article>
            </div>
        </section>

        <!-- Vocabulary -->
        <section class="surface p-5 sm:p-6" aria-labelledby="vocab-title">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="vocab-title" class="label">Vocabulary by evidence</h2>
                <span class="text-xs text-gray-400">{{ mastery.total }} words and phrases tracked</span>
            </div>

            <div v-if="!mastery.total" class="mt-3 text-sm text-gray-500">Nothing tracked yet. Words appear here as you learn and practise them.</div>

            <ul v-else class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <li v-for="category in categories" :key="category.label" class="rounded-2xl bg-gray-50 p-3.5">
                    <p class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ category.value }}</p>
                    <p class="text-sm font-medium text-gray-700">{{ category.label }}</p>
                    <p class="text-xs text-gray-400">{{ category.hint }}</p>
                </li>
            </ul>

            <div v-if="mastery.total" class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-600">
                <RouterLink v-if="mastery.dueForReview" to="/session" class="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink hover:underline">
                    {{ mastery.dueForReview }} due for review <AppIcon name="chevron-right" :size="15" />
                </RouterLink>
                <span v-if="mastery.practisedEarlier" class="text-xs text-gray-400">{{ mastery.practisedEarlier }} more were practised before evidence was recorded and are not classified yet.</span>
            </div>
        </section>

        <!-- Long-term learning -->
        <section class="surface p-5 sm:p-6" aria-labelledby="retention-title">
            <h2 id="retention-title" class="label">Long-term learning</h2>
            <p class="mt-1 text-xs text-gray-400">Retention is measured from independent answers a day or more after you first recalled a word. Finishing a scheduled review does not count by itself.</p>

            <dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div v-for="metric in metrics" :key="metric.label" class="rounded-2xl bg-gray-50 p-3.5" :data-metric="metric.label">
                    <dd class="font-display text-2xl font-semibold tabular-nums text-gray-900">{{ ratePercent(metric.data.rate) }}</dd>
                    <dt class="text-sm font-medium text-gray-700">{{ metric.label }}</dt>
                    <p class="text-xs text-gray-400">{{ metric.data.total ? `${metric.data.successes} of ${metric.data.total}` : 'no data yet' }}</p>
                </div>
            </dl>

            <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-[22rem] text-left text-sm" data-testid="retention-table">
                    <caption class="sr-only">Retention checkpoints</caption>
                    <thead>
                        <tr class="text-xs text-gray-400">
                            <th scope="col" class="py-1.5 pr-3 font-medium">After</th>
                            <th scope="col" class="px-2 font-medium">Retained</th>
                            <th scope="col" class="px-2 font-medium">Forgotten</th>
                            <th scope="col" class="px-2 font-medium">Due</th>
                            <th scope="col" class="px-2 font-medium">Missed</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 tabular-nums">
                        <tr v-for="row in retention.perHorizon" :key="row.horizon">
                            <th scope="row" class="py-2 pr-3 font-medium text-gray-700">{{ row.horizon }} day{{ row.horizon === 1 ? '' : 's' }}</th>
                            <td class="px-2 text-green-700">{{ row.retained }}</td>
                            <td class="px-2 text-red-700">{{ row.lost }}</td>
                            <td class="px-2 text-gray-600">{{ row.due }}</td>
                            <td class="px-2 text-gray-400">{{ row.missed }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-if="!retention.tracked" class="mt-2 text-xs text-gray-400">No words are being tracked for retention yet: it starts after your first independent recall of a word. (Checkpoints: {{ RETENTION_HORIZONS.join(', ') }} days.)</p>

            <p v-if="retention.srsOptimistic.length" class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                {{ retention.srsOptimistic.length }} word{{ retention.srsOptimistic.length === 1 ? ' is' : 's are' }} marked "mastered" by the review schedule without independent evidence yet. That label comes from review counts, not from proof.
            </p>

            <h3 v-if="transfer.length" class="label mt-6">Using patterns in new situations</h3>
            <ul v-if="transfer.length" class="mt-2 divide-y divide-gray-100">
                <li v-for="entry in transfer" :key="entry.pattern.id" class="flex items-center gap-3 py-2.5 text-sm" :data-pattern="entry.pattern.id">
                    <div class="min-w-0 flex-1">
                        <p class="font-medium text-gray-900">{{ entry.pattern.title }}</p>
                        <p class="text-xs text-gray-400" dir="ltr">{{ entry.pattern.frame }}</p>
                    </div>
                    <span class="shrink-0 text-xs tabular-nums text-gray-500">{{ entry.progress.successfulContexts.length }} of {{ entry.pattern.contexts.length }} situations</span>
                    <span v-if="entry.progress.transferred" class="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">Transferred</span>
                </li>
            </ul>
        </section>
    </div>
</template>
