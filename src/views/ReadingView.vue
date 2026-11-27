<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadReadingManifest, loadReadingPassage } from '../services/readingContent'
import { buildReadingLessonPlan } from '../services/readingCurriculum'
import { loadManifest } from '../services/vocabulary'
import { resolveFullHardWords } from '../services/hardWordsLookup'
import { useLocale } from '../services/locale'
import { usePerformanceStore } from '../stores/performance'
import { useEvidenceRecorder } from '../composables/useEvidenceRecorder'


import type { ReadingPassage, ReadingPassageManifest, ReadingVocabularyItem } from '../types/reading'
import type { Word } from '../types/vocabulary'
import type { ExerciseResult } from '../types/exercise'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import ExerciseSession from '../components/practice/ExerciseSession.vue'
import ItemList from '../components/practice/ItemList.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'
import WordMeaningsBlock from '../components/learn/WordMeaningsBlock.vue'
import HardWordButton from '../components/vocabulary/HardWordButton.vue'

const performanceStore = usePerformanceStore()
const { t, isPersian } = useLocale()

const passages = ref<ReadingPassageManifest[]>([])
const loading = ref(false)
const error = ref('')

const activeManifest = ref<ReadingPassageManifest | null>(null)
const activePassage = ref<ReadingPassage | null>(null)
const phase = ref<'list' | 'read' | 'exercises' | 'summary'>('list')
const exerciseIndex = ref(0)
const sessionResults = ref<ExerciseResult[]>([])

/*
 * Translations stay hidden until the learner has attempted the questions —
 * understanding comes first, translation is a post-attempt aid.
 */
const attempted = ref(false)
const showTranslation = ref(false)
const showVocabulary = ref(false)
const selectedVocabulary = ref<ReadingVocabularyItem | null>(null)
const selectedContext = ref('')
const resolvedVocabulary = ref<Record<string, Word>>({})
const vocabularyLoading = ref(false)

const currentExercise = computed(() =>
    activePassage.value?.exercises[exerciseIndex.value] ?? null
)

const currentAnswered = computed(() =>
    sessionResults.value.length > exerciseIndex.value
)

const correctCount = computed(
    () => sessionResults.value.filter(result => result.correct).length
)

const activePlan = computed(() => {
    if (!activeManifest.value || !activePassage.value) return null
    return buildReadingLessonPlan(
        activeManifest.value,
        activePassage.value.exercises.filter(exercise => exercise.type === 'reading-comprehension'),
    )
})

const fullPassageText = computed(() => activePassage.value?.paragraphs.map(paragraph => paragraph.english).join(' ') ?? '')

function objectiveText(objective: NonNullable<ReadingPassageManifest['learningObjectives']>[number]): string {
    if (typeof objective === 'string') return objective
    return isPersian.value ? objective.textPersian ?? objective.text : objective.text
}

function strategyLabel(): string {
    return activePlan.value ? t(`reading.strategy.${activePlan.value.strategy}`) : ''
}

function normalizeWord(value: string): string {
    return value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '')
}

function readingTokens(sentence: string): { text: string; vocabulary: ReadingVocabularyItem | null }[] {
    return sentence.split(/(\s+)/u).map(text => ({
        text,
        vocabulary: activePassage.value?.vocabulary.find(item => normalizeWord(item.word) === normalizeWord(text)) ?? null,
    }))
}

async function selectVocabulary(item: ReadingVocabularyItem, context: string) {
    selectedVocabulary.value = item
    selectedContext.value = context
    const key = normalizeWord(item.word)
    if (resolvedVocabulary.value[key]) return

    vocabularyLoading.value = true
    try {
        const result = await resolveFullHardWords([item.word], await loadManifest())
        const found = result.found[0]
        if (found) resolvedVocabulary.value = { ...resolvedVocabulary.value, [key]: found }
    } catch {
        /* The reading vocabulary remains usable with its authored fallback meaning. */
    } finally {
        vocabularyLoading.value = false
    }
}

async function openPassage(manifest: ReadingPassageManifest) {
    loading.value = true
    error.value = ''

    try {
        activePassage.value = await loadReadingPassage(manifest)
        activeManifest.value = manifest
        phase.value = 'read'
        exerciseIndex.value = 0
        sessionResults.value = []
        attempted.value = false
        showTranslation.value = false
        showVocabulary.value = false
        selectedVocabulary.value = null
        selectedContext.value = ''
    } catch (err) {
        error.value = err instanceof Error ? err.message : t('reading.loadError')
    } finally {
        loading.value = false
    }
}

function startQuestions() {
    attempted.value = true
    phase.value = 'exercises'
}

const evidenceRecorder = useEvidenceRecorder()

function onExerciseResult(result: ExerciseResult) {
    sessionResults.value.push(result)

    const exercise = currentExercise.value

    if (exercise && activePassage.value) evidenceRecorder.recordExercise(exercise, result, `reading/${activePassage.value.id}`)

    /* A hint-assisted answer is practice, not evidence of the skill. */
    if (result.hintUsed) return

    performanceStore.record({
        skill: 'reading',
        activityId: result.exerciseId,
        lessonId: activePassage.value?.id ?? null,
        difficulty: currentExercise.value?.difficulty ?? null,
        result: result.correct ? 'correct' : 'incorrect',
        errorCategories: result.correct ? [] : ['comprehension'],
    })
}

function nextExercise() {
    if (!activePassage.value) return

    if (exerciseIndex.value < activePassage.value.exercises.length - 1) {
        exerciseIndex.value++
        return
    }

    phase.value = 'summary'
}

function reviewPassage() {
    phase.value = 'read'
}

function backToList() {
    activePassage.value = null
    activeManifest.value = null
    phase.value = 'list'
    sessionResults.value = []
    exerciseIndex.value = 0
}

onMounted(async () => {
    loading.value = true

    try {
        passages.value = (await loadReadingManifest()).passages
    } catch (err) {
        error.value = err instanceof Error ? err.message : t('reading.loadError')
    } finally {
        loading.value = false
    }
})
</script>

<template>
    <ActivityPage :eyebrow="t('reading.eyebrow')" :title="t('reading.title')" :description="t('reading.description')" wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <!-- LIST -->
        <template v-if="phase === 'list'">
            <StateBlock v-if="loading" kind="loading" :title="t('reading.loading')" :rows="4" />
            <ItemList
                v-else
                :items="passages.map(passage => ({
                    id: passage.id,
                    title: passage.title,
                    badge: passage.cefrLevel ? { text: passage.cefrLevel, tone: 'neutral' } : null,
                    meta: [passage.kind, passage.estimatedReadingTime ? `~${passage.estimatedReadingTime} min read` : '', passage.domainTags?.join(', ')].filter(Boolean).join(' · '),
                }))"
                @open="id => openPassage(passages.find(passage => passage.id === id)!)"
            />
        </template>

        <!-- READ -->
        <div v-else-if="phase === 'read' && activePassage" class="space-y-5">
            <button type="button" class="btn-ghost -ml-3" @click="backToList"><AppIcon name="arrow-left" :size="16" /> {{ t('reading.allPassages') }}</button>

            <article class="surface p-5 sm:p-8">
                <h2 class="font-display text-2xl font-semibold text-gray-900 sm:text-3xl">{{ activePassage.title }}</h2>

                <div class="mt-4 rounded-2xl border border-accent/20 bg-accent-soft p-4">
                    <p class="label">{{ t('reading.objective') }}</p>
                    <ul v-if="activeManifest?.learningObjectives?.length" class="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                        <li v-for="objective in activeManifest.learningObjectives" :key="typeof objective === 'string' ? objective : objective.id">{{ objectiveText(objective) }}</li>
                    </ul>
                    <p class="mt-3 text-sm text-gray-700"><span class="font-semibold">{{ t('reading.strategy') }}:</span> {{ strategyLabel() }}</p>
                    <p class="mt-1 text-xs text-gray-500">{{ t(`reading.strategyHint.${activePlan?.strategy}`) }}</p>
                </div>

                <div class="mt-5 space-y-5">
                    <div v-for="(paragraph, index) in activePassage.paragraphs" :key="index">
                        <div class="flex items-start gap-2">
                            <p class="wrap-anywhere min-w-0 flex-1 font-display text-[1.12rem] leading-8 text-gray-800 sm:text-[1.2rem] sm:leading-9" dir="ltr" lang="en">
                                <span v-if="paragraph.speaker" class="mr-2 font-sans text-sm font-semibold uppercase tracking-wide text-accent-ink">{{ paragraph.speaker }}</span>
                                <template v-for="(token, tokenIndex) in readingTokens(paragraph.english)" :key="tokenIndex">
                                    <button
                                        v-if="token.vocabulary"
                                        type="button"
                                        class="rounded px-0.5 underline decoration-dotted underline-offset-4 hover:bg-learn-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-learn-500"
                                        @click="selectVocabulary(token.vocabulary, paragraph.english)"
                                    >{{ token.text }}</button>
                                    <template v-else>{{ token.text }}</template>
                                </template>
                            </p>
                            <AudioPlayer :text="paragraph.english" size="sm" tone="practice" label="Read aloud" class="shrink-0" />
                        </div>
                        <p v-if="showTranslation && paragraph.persian" class="fa-text mt-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-600" lang="fa">{{ paragraph.persian }}</p>
                    </div>
                </div>
                <div class="mt-5 border-t border-gray-100 pt-4">
                    <AudioPlayer :text="fullPassageText" size="md" tone="practice" :label="t('reading.playPassage')" />
                </div>
            </article>

            <section v-if="selectedVocabulary" class="surface border-accent/20 p-5" aria-live="polite">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="label">{{ t('reading.wordInContext') }}</p>
                        <p class="mt-1 text-sm text-gray-500" dir="ltr" lang="en">{{ selectedContext }}</p>
                    </div>
                    <button type="button" class="btn-ghost" @click="selectedVocabulary = null">{{ t('reading.closeWord') }}</button>
                </div>
                <p v-if="vocabularyLoading" class="mt-4 text-sm text-gray-500">{{ t('reading.loadingWord') }}</p>
                <WordMeaningsBlock
                    v-else-if="resolvedVocabulary[normalizeWord(selectedVocabulary.word)]"
                    class="mt-4"
                    :word="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].word"
                    :meaning="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].meaning"
                    :pos="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].pos"
                    :synonyms="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].synonyms"
                    :examples="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].examples"
                    :collocations="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].collocations"
                    :related-expressions="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].relatedExpressions"
                    :usage="resolvedVocabulary[normalizeWord(selectedVocabulary.word)].usage"
                    :source="{ context: selectedContext, module: 'reading', lessonId: activePassage.id }"
                />
                <div v-else class="mt-4">
                    <p class="font-display text-xl font-semibold" dir="ltr" lang="en">{{ selectedVocabulary.word }}</p>
                    <p v-if="selectedVocabulary.persian" class="fa-text mt-1 text-lg" lang="fa">{{ selectedVocabulary.persian }}</p>
                    <p class="mt-2 text-sm text-gray-500">{{ selectedVocabulary.meaning }}</p>
                    <HardWordButton
                        class="mt-3"
                        :word-id="selectedVocabulary.word"
                        :meaning="selectedVocabulary.persian ?? selectedVocabulary.meaning"
                        :source="{ context: selectedContext, module: 'reading', lessonId: activePassage.id }"
                    />
                </div>
            </section>

            <section v-if="activePassage.vocabulary.length" class="surface">
                <button type="button" class="flex min-h-12 w-full items-center gap-2 px-5 text-left text-sm font-semibold text-gray-700" :aria-expanded="showVocabulary" @click="showVocabulary = !showVocabulary">
                    {{ t('reading.keyVocabulary') }} ({{ activePassage.vocabulary.length }})
                    <AppIcon name="chevron-down" :size="16" class="ml-auto text-gray-400 transition-transform" :class="showVocabulary ? 'rotate-180' : ''" />
                </button>
                <ul v-if="showVocabulary" class="divide-y divide-gray-100 border-t border-gray-100 px-5">
                    <li v-for="item in activePassage.vocabulary" :key="item.word" class="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <button type="button" class="font-semibold text-accent-ink underline decoration-dotted underline-offset-4" dir="ltr" @click="selectVocabulary(item, activePassage.paragraphs.find(paragraph => paragraph.english.toLowerCase().includes(item.word.toLowerCase()))?.english ?? '')">{{ item.word }}</button>
                        <span class="text-gray-500">{{ item.meaning }}</span>
                        <span v-if="item.persian" class="fa-text text-gray-500" lang="fa">{{ item.persian }}</span>
                    </li>
                </ul>
            </section>

            <div class="flex flex-col gap-3 sm:flex-row">
                <button type="button" class="btn-primary btn-lg flex-1" @click="startQuestions">
                    {{ attempted ? t('reading.backToQuestions') : t('reading.startQuestions', { count: String(activePassage.exercises.length) }) }}
                </button>
                <button v-if="attempted" type="button" class="btn-secondary btn-lg" @click="showTranslation = !showTranslation">
                    {{ showTranslation ? t('reading.hideTranslation') : t('reading.showTranslation') }}
                </button>
            </div>
            <p v-if="!attempted" class="text-center text-xs text-gray-400">{{ t('reading.translationHint') }}</p>
        </div>

        <!-- EXERCISES -->
        <ExerciseSession
            v-else-if="phase === 'exercises' && activePassage && currentExercise"
            :exercise="currentExercise"
            :index="exerciseIndex"
            :total="activePassage.exercises.length"
            :answered="currentAnswered"
            :title="activePassage.title"
            @result="onExerciseResult"
            @next="nextExercise"
        >
            <template #footer>
                <button type="button" class="btn-ghost -ml-3" @click="reviewPassage"><AppIcon name="arrow-left" :size="16" /> {{ t('reading.reread') }}</button>
            </template>
        </ExerciseSession>

        <!-- SUMMARY -->
        <ActivityResult
            v-else-if="phase === 'summary' && activePassage"
            :title="t('reading.complete')"
            :score="correctCount"
            :total="sessionResults.length"
            :message="t('reading.completeMessage')"
            :action-label="t('reading.allPassages')"
            @action="backToList"
        >
            <template #secondary>
                <button type="button" class="btn-secondary btn-lg" @click="showTranslation = true; reviewPassage()">{{ t('reading.rereadTranslation') }}</button>
            </template>
        </ActivityResult>
    </ActivityPage>
</template>
