<script setup lang="ts">
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'
import { computed, onMounted, ref } from 'vue'

import { loadGrammarManifest, loadGrammarTopic } from '../services/grammarContent'
import { buildGrammarCurriculum, curriculumEntry } from '../services/grammarCurriculum'
import { useLocale } from '../services/locale'
import { useGrammarProgressStore } from '../stores/grammarProgress'
import { usePerformanceStore } from '../stores/performance'


import type { GrammarTopic, GrammarTopicManifest } from '../types/grammar'
import type { ExerciseResult } from '../types/exercise'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import ExerciseSession from '../components/practice/ExerciseSession.vue'
import ItemList from '../components/practice/ItemList.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

const PASS_THRESHOLD = 0.7

const grammarProgressStore = useGrammarProgressStore()
const performanceStore = usePerformanceStore()
const { t, isPersian } = useLocale()

const topics = ref<GrammarTopicManifest[]>([])
const curriculum = ref<ReturnType<typeof buildGrammarCurriculum>>([])
const loading = ref(false)
const error = ref('')

/* learn flow */
const activeTopic = ref<GrammarTopic | null>(null)
const activeManifest = ref<GrammarTopicManifest | null>(null)
const phase = ref<'list' | 'explanation' | 'exercises' | 'summary'>('list')
const exerciseIndex = ref(0)
const sessionResults = ref<ExerciseResult[]>([])

const groupedTopics = computed(() => {
    const groups = new Map<string, GrammarTopicManifest[]>()

    for (const topic of topics.value) {
        const level = topic.cefrLevel ?? 'Unlevelled'

        if (!groups.has(level)) {
            groups.set(level, [])
        }

        groups.get(level)!.push(topic)
    }

    return Array.from(groups.entries()).map(([level, items]) => ({ level, items }))
})

const currentExercise = computed(() =>
    activeTopic.value?.exercises[exerciseIndex.value] ?? null
)

const currentAnswered = computed(() =>
    sessionResults.value.length > exerciseIndex.value
)

const activeCurriculum = computed(() =>
    activeTopic.value ? curriculumEntry(curriculum.value, activeTopic.value.id) : undefined,
)

const correctCount = computed(
    () => sessionResults.value.filter(result => result.correct).length
)

const sessionPassed = computed(() => {
    const total = sessionResults.value.length

    return total > 0 && correctCount.value / total >= PASS_THRESHOLD
})

function statusLabel(topicId: string): string {
    const item = grammarProgressStore.progress.find(p => p.topicId === topicId)

    if (!item || item.status === 'new') return ''

    return item.status
}

function localizedObjective(objective: NonNullable<GrammarTopicManifest['learningObjectives']>[number]): string {
    if (typeof objective === 'string') return objective
    return isPersian.value ? objective.textPersian ?? objective.text : objective.text
}

function objectiveLabels(topic: GrammarTopicManifest): string[] {
    return (topic.learningObjectives ?? []).map(localizedObjective)
}

function topicStatus(topicId: string): string {
    const status = statusLabel(topicId)
    return status ? t(`dashboard.status.${status}`) : ''
}

function isDue(topicId: string): boolean {
    return grammarProgressStore
        .getDueTopics()
        .some(item => item.topicId === topicId)
}

async function openTopic(manifest: GrammarTopicManifest) {
    loading.value = true
    error.value = ''

    try {
        activeManifest.value = manifest
        activeTopic.value = await loadGrammarTopic(manifest)
        phase.value = 'explanation'
        exerciseIndex.value = 0
        sessionResults.value = []
    } catch (err) {
        error.value = err instanceof Error ? err.message : t('grammar.loadError')
    } finally {
        loading.value = false
    }
}

function startExercises() {
    phase.value = 'exercises'
}

const evidenceRecorder = useEvidenceRecorder()

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    const exercise = currentExercise.value

    if (activeTopic.value && exercise) {
        evidenceRecorder.recordGrammar(activeTopic.value.id, exercise.type, result.correct, result.hintUsed !== true)
        evidenceRecorder.recordExercise(exercise, result, `grammar/${activeTopic.value.id}`)
    }

    /* A hint-assisted answer is practice, not evidence of the skill. */
    if (result.hintUsed) return

    performanceStore.record({
        skill: 'grammar',
        activityId: result.exerciseId,
        lessonId: activeTopic.value?.id ?? null,
        difficulty: exercise?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['grammar'],
    })
}

function nextExercise() {
    if (!activeTopic.value) return

    if (exerciseIndex.value < activeTopic.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    finishSession()
}

function finishSession() {
    if (!activeTopic.value) return

    const wrongCount = sessionResults.value.length - correctCount.value

    grammarProgressStore.recordSession(
        activeTopic.value.id,
        sessionPassed.value,
        correctCount.value,
        wrongCount
    )

    phase.value = 'summary'
}

function backToList() {
    activeTopic.value = null
    phase.value = 'list'
    sessionResults.value = []
    exerciseIndex.value = 0
}

onMounted(async () => {
    loading.value = true

    try {
        const manifest = await loadGrammarManifest()
        topics.value = manifest.topics
        curriculum.value = buildGrammarCurriculum(manifest)
    } catch (err) {
        error.value = err instanceof Error ? err.message : t('grammar.loadError')
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <ActivityPage :eyebrow="t('grammar.eyebrow')" :title="t('grammar.title')" :description="t('grammar.description')" wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <!-- TOPIC LIST -->
        <template v-if="phase === 'list'">
            <StateBlock v-if="loading" kind="loading" :title="t('grammar.loading')" :rows="4" />

            <ItemList
                v-for="group in groupedTopics"
                :key="group.level"
                :heading="group.level"
                :items="group.items.map(topic => ({
                    id: topic.id,
                    title: topic.title,
                    subtitlePersian: topic.titlePersian,
                    badge: isDue(topic.id) ? { text: t('grammar.due'), tone: 'warn' } : topicStatus(topic.id) ? { text: topicStatus(topic.id), tone: 'neutral' } : null,
                    meta: `${curriculumEntry(curriculum, topic.id)?.sequence ?? ''} · ${topic.category ?? t('grammar.foundations')}${topic.estimatedDuration ? ` · ~${topic.estimatedDuration} min` : ''}`,
                }))"
                @open="id => openTopic(topics.find(topic => topic.id === id)!)"
            />
        </template>

        <!-- EXPLANATION + EXAMPLES -->
        <div v-else-if="phase === 'explanation' && activeTopic" class="space-y-5">
            <button type="button" class="btn-ghost -ml-3" @click="backToList"><AppIcon name="arrow-left" :size="16" /> {{ t('grammar.allTopics') }}</button>

            <article class="surface p-5 sm:p-7">
                <h2 class="font-display text-2xl font-semibold text-gray-900 sm:text-3xl">{{ activeTopic.title }}</h2>
                <p class="mt-4 text-[1.05rem] leading-8 text-gray-800" dir="ltr" lang="en">{{ activeTopic.explanation }}</p>
                <p v-if="activeTopic.explanationPersian" class="fa-text mt-4 rounded-2xl bg-gray-50 p-4 text-gray-700" lang="fa">{{ activeTopic.explanationPersian }}</p>
                <div v-if="activeManifest?.learningObjectives?.length" class="mt-5 rounded-2xl border border-accent/20 bg-accent-soft p-4">
                    <p class="label">{{ t('grammar.communicationGoal') }}</p>
                    <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                        <li v-for="objective in objectiveLabels(activeManifest)" :key="objective">{{ objective }}</li>
                    </ul>
                </div>
            </article>

            <section class="surface p-5 sm:p-7">
                <p class="label">{{ t('grammar.lessonSequence') }}</p>
                <ol class="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                    <li v-for="(stage, index) in activeCurriculum?.stages ?? []" :key="stage" class="flex gap-2">
                        <span class="font-semibold text-accent">{{ index + 1 }}.</span>
                        <span>{{ t(`grammar.stage.${stage}`) }}</span>
                    </li>
                </ol>
                <p v-if="activeCurriculum?.prerequisiteIds.length" class="mt-4 text-xs text-gray-500">
                    {{ t('grammar.prerequisite') }}: {{ activeCurriculum.prerequisiteIds.join(', ') }}
                </p>
            </section>

            <section v-if="activeTopic.examples.length" class="surface divide-y divide-gray-100">
                <h3 class="label px-5 pb-1 pt-4">{{ t('grammar.examples') }}</h3>
                <div v-for="(example, index) in activeTopic.examples" :key="index" class="flex items-start gap-3 px-5 py-3.5">
                    <div class="min-w-0 flex-1">
                        <p class="wrap-anywhere text-[1.02rem] text-gray-900" dir="ltr" lang="en">{{ example.english }}</p>
                        <p v-if="example.persian" class="fa-text text-sm text-gray-500" lang="fa">{{ example.persian }}</p>
                        <p v-if="example.note" class="mt-0.5 text-xs text-gray-400">{{ example.note }}</p>
                    </div>
                    <AudioPlayer :text="example.english" size="sm" tone="practice" :label="example.english" />
                </div>
            </section>

            <button type="button" class="btn-primary btn-lg w-full" @click="startExercises">{{ t('grammar.startExercises', { count: String(activeTopic.exercises.length) }) }}</button>
        </div>

        <!-- EXERCISES -->
        <ExerciseSession
            v-else-if="phase === 'exercises' && activeTopic && currentExercise"
            :exercise="currentExercise"
            :index="exerciseIndex"
            :total="activeTopic.exercises.length"
            :answered="currentAnswered"
            :title="activeTopic.title"
            @result="onExerciseResult"
            @next="nextExercise"
        />

        <!-- SUMMARY -->
        <ActivityResult
            v-else-if="phase === 'summary' && activeTopic"
            :title="sessionPassed ? t('grammar.sessionPassed') : t('grammar.keepGoing')"
            :score="correctCount"
            :total="sessionResults.length"
            :message="sessionPassed ? t('grammar.reviewScheduled') : t('grammar.belowPassMark')"
            :action-label="t('grammar.allTopics')"
            @action="backToList"
        >
            <template #secondary>
                <button type="button" class="btn-secondary btn-lg" @click="openTopic(topics.find(topic => topic.id === activeTopic!.id)!)">{{ t('grammar.practiceAgain') }}</button>
            </template>
        </ActivityResult>
    </ActivityPage>
</template>
