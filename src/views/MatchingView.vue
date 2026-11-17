<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'
import ActivityBar from '../components/practice/ActivityBar.vue'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import AnswerFeedback from '../components/practice/AnswerFeedback.vue'
import LessonPicker from '../components/practice/LessonPicker.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

interface Tile {
    id: string
    wordKey: string
    label: string
    kind: 'word' | 'meaning'
    matched: boolean
}

const ROUND_SIZE = 6

const progressStore = useWordProgressStore()
const courses = ref<CourseManifest[]>([])
const selectedCourseId = ref('')
const selectedLessonId = ref('')
const allWords = ref<Word[]>([])
const roundWords = ref<Word[]>([])
const tiles = ref<Tile[]>([])
const selectedTileIds = ref<string[]>([])
const wrongPairIds = ref<string[]>([])
const matchedCount = ref(0)
const loading = ref(false)
const started = ref(false)
const error = ref('')

const selectedCourse = computed(() =>
    courses.value.find(c => c.id === selectedCourseId.value)
)

const selectedLesson = computed<LessonManifest | null>(() =>
    selectedCourse.value?.lessons.find(l => l.id === selectedLessonId.value) ?? null
)

const availableLessons = computed(() => selectedCourse.value?.lessons ?? [])

const roundFinished = computed(
    () => started.value && tiles.value.length > 0 && matchedCount.value === roundWords.value.length
)

const allFinished = computed(
    () => started.value && roundFinished.value && roundWords.value.length === 0
)

function shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5)
}

function buildRound() {
    const batch = allWords.value.splice(0, ROUND_SIZE)
    roundWords.value = batch
    matchedCount.value = 0
    selectedTileIds.value = []
    wrongPairIds.value = []

    const wordTiles: Tile[] = batch.map(w => ({
        id: `w-${w.word}`,
        wordKey: w.word,
        label: w.word,
        kind: 'word',
        matched: false,
    }))

    const meaningTiles: Tile[] = batch.map(w => ({
        id: `m-${w.word}`,
        wordKey: w.word,
        label: w.meaning,
        kind: 'meaning',
        matched: false,
    }))

    tiles.value = shuffle([...wordTiles, ...meaningTiles])
}

async function startMatching() {
    if (!selectedLesson.value) return

    loading.value = true
    error.value = ''
    started.value = false

    try {
        const words = await loadLesson(selectedLesson.value)
        allWords.value = shuffle(words)
        started.value = true
        buildRound()
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function selectTile(tile: Tile) {
    if (tile.matched || wrongPairIds.value.length) return
    if (selectedTileIds.value.includes(tile.id)) return
    if (selectedTileIds.value.length >= 2) return

    selectedTileIds.value.push(tile.id)

    if (selectedTileIds.value.length === 2) {
        const [firstId, secondId] = selectedTileIds.value
        const first = tiles.value.find(t => t.id === firstId)
        const second = tiles.value.find(t => t.id === secondId)

        if (first && second && first.wordKey === second.wordKey && first.kind !== second.kind) {
            first.matched = true
            second.matched = true
            matchedCount.value++
            selectedTileIds.value = []

            const word = roundWords.value.find(w => w.word === first.wordKey)
            if (word) {
                progressStore.recordCorrect(word.word, word.courseId, word.lessonId, { mode: 'recognition', ctx: 'matching' })
            }
        } else {
            wrongPairIds.value = [firstId, secondId]
            window.setTimeout(() => {
                wrongPairIds.value = []
                selectedTileIds.value = []
            }, 600)
        }
    }
}

function nextRound() {
    if (allWords.value.length) {
        buildRound()
    }
}

function restart() {
    started.value = false
    tiles.value = []
    allWords.value = []
    roundWords.value = []
}

const route = useRoute()

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses

        const queryCourseId = String(route.query.courseId ?? '')
        const queryLessonId = String(route.query.lessonId ?? '')

        const hasQueryCourse = courses.value.some(c => c.id === queryCourseId)

        selectedCourseId.value = hasQueryCourse
            ? queryCourseId
            : (courses.value[0]?.id ?? '')

        if (
            hasQueryCourse &&
            availableLessons.value.some(l => l.id === queryLessonId)
        ) {
            selectedLessonId.value = queryLessonId
            await startMatching()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <ActivityPage eyebrow="Matching" title="Match the pairs" description="Tap a word, then its meaning. A quick review with no typing." wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <LessonPicker
            v-if="!started"
            v-model:course-id="selectedCourseId"
            v-model:lesson-id="selectedLessonId"
            :courses="courses"
            :loading="loading"
            @start="startMatching"
        />

        <ActivityResult
            v-else-if="allFinished"
            title="All pairs matched"
            message="Nicely done."
            action-label="Match another lesson"
            @action="restart"
        />

        <article v-else-if="started && tiles.length" class="surface p-5 sm:p-7">
            <div class="mb-4 flex items-center justify-between gap-3 text-sm">
                <span class="font-semibold tabular-nums text-gray-700">{{ matchedCount }} <span class="font-normal text-gray-400">/ {{ roundWords.length }} matched</span></span>
                <span v-if="allWords.length" class="text-xs text-gray-400">{{ allWords.length }} more after this round</span>
            </div>
            <div class="mb-5 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" :aria-valuenow="matchedCount" aria-valuemin="0" :aria-valuemax="roundWords.length" aria-label="Pairs matched">
                <div class="h-full rounded-full bg-accent motion-safe-only transition-all duration-300" :style="{ width: `${roundWords.length ? (matchedCount / roundWords.length) * 100 : 0}%` }" />
            </div>

            <div v-if="roundFinished" class="rounded-2xl bg-green-50 p-6 text-center">
                <p class="flex items-center justify-center gap-2 font-semibold text-green-600"><AppIcon name="check" :size="18" /> Round complete</p>
                <button type="button" class="btn-primary btn-lg mt-4 w-full sm:w-auto sm:min-w-48" @click="nextRound">Next round</button>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button
                    v-for="tile in tiles"
                    :key="tile.id"
                    type="button"
                    class="choice !min-h-[4.5rem] justify-center text-center text-sm font-medium"
                    :class="[
                        tile.matched
                            ? 'invisible'
                            : wrongPairIds.includes(tile.id)
                                ? 'choice-wrong'
                                : selectedTileIds.includes(tile.id)
                                    ? 'choice-selected'
                                    : '',
                    ]"
                    :disabled="tile.matched"
                    dir="auto"
                    @click="selectTile(tile)"
                >
                    {{ tile.label }}
                </button>
            </div>
        </article>
    </ActivityPage>
</template>
