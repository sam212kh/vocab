<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadLesson, loadManifest } from '../services/vocabulary'
import { useWordProgressStore } from '../stores/wordProgress'
import { answersMatch } from '../services/textMatch'
import type { CourseManifest, LessonManifest, Word } from '../types/vocabulary'
import ActivityBar from '../components/practice/ActivityBar.vue'
import ActivityPage from '../components/practice/ActivityPage.vue'
import ActivityResult from '../components/practice/ActivityResult.vue'
import AnswerFeedback from '../components/practice/AnswerFeedback.vue'
import LessonPicker from '../components/practice/LessonPicker.vue'
import AudioPlayer from '../components/learn/AudioPlayer.vue'
import AppIcon from '../components/ui/AppIcon.vue'
import StateBlock from '../components/ui/StateBlock.vue'

interface ClozeQuestion {
    word: Word
    before: string
    blank: string
    after: string
    persian: string
}

const progressStore = useWordProgressStore()
const courses = ref<CourseManifest[]>([])
const selectedCourseId = ref('')
const selectedLessonId = ref('')
const questions = ref<ClozeQuestion[]>([])
const index = ref(0)
const answer = ref('')
const revealed = ref(false)
const result = ref<'correct' | 'wrong' | null>(null)
const loading = ref(false)
const error = ref('')
const started = ref(false)
const score = ref(0)

const selectedCourse = computed(() =>
    courses.value.find(c => c.id === selectedCourseId.value)
)

const selectedLesson = computed<LessonManifest | null>(() =>
    selectedCourse.value?.lessons.find(l => l.id === selectedLessonId.value) ?? null
)

const availableLessons = computed(() => selectedCourse.value?.lessons ?? [])

const current = computed(() => questions.value[index.value] ?? null)
const finished = computed(() => started.value && index.value >= questions.value.length)

function stripSense(word: string): string {
    return word.replace(/\s*\([^)]*\)/g, '').trim()
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildQuestion(word: Word): ClozeQuestion | null {
    const headword = stripSense(word.word)
    if (!headword) return null

    for (const example of word.examples) {
        if (!example.english) continue

        const pattern = new RegExp(`\\b${escapeRegExp(headword)}\\b`, 'i')
        const match = pattern.exec(example.english)

        if (match) {
            return {
                word,
                before: example.english.slice(0, match.index),
                blank: match[0],
                after: example.english.slice(match.index + match[0].length),
                persian: example.persian,
            }
        }
    }

    return null
}

async function startCloze() {
    if (!selectedLesson.value) return

    loading.value = true
    error.value = ''
    answer.value = ''
    revealed.value = false
    result.value = null
    score.value = 0
    started.value = false

    try {
        const words = await loadLesson(selectedLesson.value)

        questions.value = words
            .map(buildQuestion)
            .filter((q): q is ClozeQuestion => q !== null)

        index.value = 0
        started.value = true
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load lesson'
    } finally {
        loading.value = false
    }
}

function checkAnswer() {
    if (!current.value || revealed.value) return

    revealed.value = true
    result.value = answersMatch(current.value.blank, answer.value) ? 'correct' : 'wrong'

    if (result.value === 'correct') {
        score.value++
        progressStore.recordCorrect(
            current.value.word.word,
            current.value.word.courseId,
            current.value.word.lessonId
        )
    } else {
        progressStore.recordWrong(
            current.value.word.word,
            current.value.word.courseId,
            current.value.word.lessonId
        )
    }
}

function next() {
    if (!questions.value.length) return
    index.value++
    answer.value = ''
    revealed.value = false
    result.value = null
}

function restart() {
    started.value = false
    questions.value = []
    index.value = 0
    score.value = 0
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
            await startCloze()
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to load courses'
    }
})
</script>

<template>
    <ActivityPage eyebrow="Cloze" title="Fill in the blank" description="Read the real sentence and work out the missing word from context." wide>
        <StateBlock v-if="error" kind="error" :text="error" />

        <LessonPicker
            v-if="!started || (started && !questions.length && !loading)"
            v-model:course-id="selectedCourseId"
            v-model:lesson-id="selectedLessonId"
            :courses="courses"
            :loading="loading"
            @start="startCloze"
        />

        <StateBlock
            v-if="started && !questions.length && !loading"
            kind="empty"
            title="No usable sentences"
            text="No sentences in this lesson matched a single target word well enough for a cloze exercise. Try another lesson."
        />

        <ActivityResult
            v-else-if="finished"
            title="Cloze complete"
            :score="score"
            :total="questions.length"
            message="Your answers were added to your review progress."
            action-label="Practice another lesson"
            @action="restart"
        />

        <article v-else-if="current" class="surface mx-auto max-w-2xl p-5 sm:p-7">
            <ActivityBar :current="index" :total="questions.length" :score="score" />

            <div class="mt-8 text-center">
                <p class="eyebrow">Complete the sentence</p>
                <p class="wrap-anywhere mt-4 text-2xl leading-[1.9] text-gray-900 sm:text-3xl sm:leading-[1.8]" dir="ltr" lang="en">
                    {{ current.before }}<span
                        class="mx-1 inline-block min-w-[5.5rem] rounded-lg border-b-2 border-accent bg-accent-soft px-2 text-center font-semibold text-accent-ink"
                    >{{ revealed ? current.blank : '&nbsp;' }}</span>{{ current.after }}
                </p>
                <p v-if="current.persian" class="fa-text mt-2 text-sm text-gray-500" lang="fa">{{ current.persian }}</p>
            </div>

            <form class="mt-7" @submit.prevent="revealed ? next() : (answer.trim() && checkAnswer())">
                <input
                    v-model="answer"
                    :disabled="revealed"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    dir="ltr"
                    aria-label="Type the missing word"
                    placeholder="Type the missing word…"
                    class="field !min-h-14 text-center text-xl"
                    :class="revealed ? (result === 'correct' ? '!border-green-600 !bg-green-50' : '!border-red-600 !bg-red-50') : ''"
                />

                <AnswerFeedback v-if="revealed" class="mt-4" :correct="result === 'correct'" :answer="current.blank">
                    <AudioPlayer :text="current.before + current.blank + current.after" size="md" slow label="Hear the sentence" tone="practice" />
                </AnswerFeedback>

                <div class="mt-5 flex gap-3">
                    <button v-if="!revealed" type="submit" class="btn-primary btn-lg flex-1" :disabled="!answer.trim()">Check</button>
                    <button v-else type="button" class="btn-primary btn-lg flex-1" @click="next">{{ index >= questions.length - 1 ? 'See results' : 'Continue' }}</button>
                </div>
            </form>
        </article>
    </ActivityPage>
</template>
