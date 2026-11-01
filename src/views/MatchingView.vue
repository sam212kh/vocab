<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'

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
                progressStore.recordCorrect(word.word, word.courseId, word.lessonId)
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
    <section class="mx-auto max-w-4xl">
        <div class="mb-8">
            <p class="text-sm font-semibold uppercase tracking-wider text-gray-500">Matching</p>
            <h1 class="mt-1 text-3xl font-bold">Match the pairs</h1>
            <p class="mt-2 text-gray-500">
                Tap a word, then its meaning. Quick review, no typing.
            </p>
        </div>

        <div class="mb-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
            <label class="text-sm font-medium">
                Course
                <select
                    v-model="selectedCourseId"
                    class="mt-2 w-full rounded-lg border px-3 py-2"
                    @change="selectedLessonId = ''"
                >
                    <option v-for="course in courses" :key="course.id" :value="course.id">
                        {{ course.title }}
                    </option>
                </select>
            </label>

            <label class="text-sm font-medium">
                Lesson
                <select v-model="selectedLessonId" class="mt-2 w-full rounded-lg border px-3 py-2">
                    <option value="">Select a lesson</option>
                    <option v-for="lesson in availableLessons" :key="lesson.id" :value="lesson.id">
                        {{ lesson.title }}
                    </option>
                </select>
            </label>

            <button
                type="button"
                class="rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 md:col-span-2"
                :disabled="loading || !selectedLessonId"
                @click="startMatching"
            >
                {{ loading ? 'Loading...' : 'Start' }}
            </button>
        </div>

        <div v-if="error" class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {{ error }}
        </div>

        <div v-if="allFinished" class="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <p class="text-sm text-gray-500">All pairs matched</p>
            <h2 class="mt-2 text-2xl font-bold">Nicely done!</h2>
            <button
                type="button"
                class="mt-6 rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
                @click="restart"
            >
                Match another lesson
            </button>
        </div>

        <div v-else-if="started && tiles.length" class="rounded-2xl border bg-white p-6 shadow-sm">
            <div class="mb-4 flex items-center justify-between text-sm text-gray-500">
                <span>{{ matchedCount }} / {{ roundWords.length }} matched</span>
                <span v-if="allWords.length">{{ allWords.length }} words left after this round</span>
            </div>

            <div v-if="roundFinished" class="rounded-xl bg-green-50 p-6 text-center text-green-700">
                <strong>Round complete!</strong>
                <button
                    type="button"
                    class="mt-4 block w-full rounded-xl bg-gray-900 px-5 py-3 font-semibold text-white hover:bg-gray-700"
                    @click="nextRound"
                >
                    Next round
                </button>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button
                    v-for="tile in tiles"
                    :key="tile.id"
                    type="button"
                    class="min-h-[4.5rem] rounded-xl border p-3 text-sm font-medium transition"
                    :class="[
                        tile.matched
                            ? 'invisible'
                            : wrongPairIds.includes(tile.id)
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : selectedTileIds.includes(tile.id)
                                    ? 'border-gray-900 bg-gray-900 text-white'
                                    : 'bg-white hover:bg-gray-50',
                    ]"
                    :disabled="tile.matched"
                    @click="selectTile(tile)"
                >
                    {{ tile.label }}
                </button>
            </div>
        </div>
    </section>
</template>
