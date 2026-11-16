<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { shuffle, validateAnswer } from '../../services/exerciseEngine'
import { annotateNumbers } from '../../services/numbers'
import { analyzeTextAnswer } from '../../services/answerDiff'
import AppIcon from '../ui/AppIcon.vue'
import AudioPlayer from '../learn/AudioPlayer.vue'

import type { AnswerAnalysis } from '../../services/answerDiff'

import type {
    Exercise,
    ExerciseAnswer,
    ExerciseResult,
} from '../../types/exercise'

const props = defineProps<{
    exercise: Exercise
}>()

const emit = defineEmits<{
    result: [result: ExerciseResult]
}>()

const result = ref<ExerciseResult | null>(null)
const textAnswer = ref('')
const chosenIndex = ref<number | null>(null)

/* sentence-ordering state: display order is shuffled; pickedPositions holds
 * indexes into the ORIGINAL segments array, in the order the learner clicked. */
const shuffledSegmentIndexes = ref<number[]>([])
const pickedPositions = ref<number[]>([])

/* matching state: right side shuffled; selection[leftIndex] = original right index */
const shuffledRightIndexes = ref<number[]>([])
const matchSelection = ref<(number | null)[]>([])

watch(
    () => props.exercise,
    () => resetState(),
    { immediate: true }
)

function resetState() {
    result.value = null
    textAnswer.value = ''
    chosenIndex.value = null
    pickedPositions.value = []

    if (props.exercise.type === 'sentence-ordering') {
        shuffledSegmentIndexes.value = shuffle(
            props.exercise.segments.map((_, index) => index)
        )
    }

    if (props.exercise.type === 'matching') {
        shuffledRightIndexes.value = shuffle(
            props.exercise.pairs.map((_, index) => index)
        )
        matchSelection.value = props.exercise.pairs.map(() => null)
    }
}

const answered = computed(() => result.value !== null)

const isChoiceType = computed(() =>
    ['multiple-choice', 'listening-comprehension', 'reading-comprehension'].includes(
        props.exercise.type
    )
)

const isTextType = computed(() =>
    ['fill-blank', 'translation', 'short-answer', 'dictation', 'grammar-correction'].includes(
        props.exercise.type
    )
)

const choiceOptions = computed<string[]>(() => {
    const exercise = props.exercise

    if (
        exercise.type === 'multiple-choice' ||
        exercise.type === 'listening-comprehension' ||
        exercise.type === 'reading-comprehension'
    ) {
        return exercise.options
    }

    return []
})

const correctChoiceIndex = computed<number>(() => {
    const exercise = props.exercise

    if (
        exercise.type === 'multiple-choice' ||
        exercise.type === 'listening-comprehension' ||
        exercise.type === 'reading-comprehension'
    ) {
        return exercise.correctIndex
    }

    return -1
})

function submit(answer: ExerciseAnswer) {
    if (answered.value) return

    const validation = validateAnswer(props.exercise, answer)

    result.value = validation

    emit('result', validation)
}

function chooseOption(index: number) {
    if (answered.value) return
    chosenIndex.value = index
    submit({ kind: 'choice', index })
}

function submitText() {
    submit({ kind: 'text', text: textAnswer.value })
}

function pickSegment(originalIndex: number) {
    if (answered.value) return
    if (pickedPositions.value.includes(originalIndex)) return

    pickedPositions.value.push(originalIndex)

    if (pickedPositions.value.length === segmentCount.value) {
        submit({ kind: 'ordering', order: [...pickedPositions.value] })
    }
}

function unpickSegment(position: number) {
    if (answered.value) return
    pickedPositions.value.splice(position, 1)
}

const segmentCount = computed(() =>
    props.exercise.type === 'sentence-ordering'
        ? props.exercise.segments.length
        : 0
)

/**
 * Word-level analysis for incorrect translation / grammar-correction
 * answers: names the specific wrong words instead of implying the whole
 * sentence was wrong, and separates meaning from wording. Deterministic
 * (services/answerDiff) — scoring itself is untouched.
 */
const answerAnalysis = computed<AnswerAnalysis | null>(() => {
    if (!result.value || result.value.correct) return null

    const exercise = props.exercise

    if (exercise.type !== 'translation' && exercise.type !== 'grammar-correction') return null
    if (!result.value.received || result.value.received === '(no answer)') return null

    return analyzeTextAnswer(exercise.acceptedAnswers, result.value.received)
})

const meaningLabel = computed(() => {
    switch (answerAnalysis.value?.meaning) {
        case 'subject-differs':
            return 'The subject of your sentence differs from the prompt — that changes the meaning.'
        case 'close':
            return 'Your sentence matches the intended meaning — the issue is wording, not meaning.'
        case 'different':
            return 'Your sentence is quite different from the expected answer.'
        default:
            return ''
    }
})

/**
 * After a dictation attempt, surface both forms of any numbers in the
 * sentence (digits — English words — Persian) as learning assistance.
 */
const numberAnnotations = computed(() => {
    if (props.exercise.type !== 'dictation' || !answered.value) return []

    return annotateNumbers(props.exercise.audioText)
})

function submitMatching() {
    if (matchSelection.value.some(selection => selection === null)) return

    submit({
        kind: 'matching',
        matches: matchSelection.value.map((rightIndex, leftIndex) => ({
            leftIndex,
            rightIndex: rightIndex!,
        })),
    })
}
</script>

<template>
    <div>
        <!-- Listening: play button instead of showing the text -->
        <div
            v-if="exercise.type === 'listening-comprehension' || exercise.type === 'dictation'"
            class="mb-5 flex items-center justify-center rounded-2xl bg-practice-50 px-4 py-3"
        >
            <AudioPlayer :text="exercise.audioText" lang="en-US" size="lg" slow tone="practice" label="Listen" />
        </div>

        <!-- Prompt (break-words: long sentences must wrap, never overflow
             the card on narrow screens) -->
        <div class="min-w-0 break-words text-center">
            <p v-if="exercise.type === 'fill-blank'" class="text-lg leading-relaxed">
                {{ exercise.before }}
                <span class="mx-1 inline-block min-w-24 rounded border-b-2 border-practice-500 px-2 font-semibold text-practice-700">
                    {{ answered ? result!.expected : '______' }}
                </span>
                {{ exercise.after }}
            </p>

            <p v-else-if="exercise.type === 'translation'" class="text-xl font-semibold" dir="auto">
                {{ exercise.source }}
            </p>

            <p v-else-if="exercise.type === 'grammar-correction'" class="text-lg">
                Correct this sentence:
                <span class="mt-2 block rounded-2xl bg-bad-50 p-3 font-medium text-ink">
                    {{ exercise.incorrectSentence }}
                </span>
            </p>

            <p v-else-if="exercise.type === 'sentence-ordering'" class="text-lg text-gray-600">
                Put the words in the correct order.
            </p>

            <p v-else-if="exercise.type === 'matching'" class="text-lg text-gray-600">
                Match each item with its pair.
            </p>

            <p v-else-if="exercise.type === 'dictation'" class="text-lg text-gray-600">
                Type exactly what you hear.
            </p>

            <p v-else-if="'prompt' in exercise" class="text-lg font-medium">
                {{ exercise.prompt }}
            </p>
        </div>

        <!-- Choice options -->
        <div v-if="isChoiceType" class="mt-6 grid gap-3">
            <button
                v-for="(option, index) in choiceOptions"
                :key="index"
                type="button"
                class="min-h-14 rounded-2xl border border-work-line bg-white p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/30"
                :class="{
                    'border-good-600 bg-good-50': answered && index === correctChoiceIndex,
                    'border-bad-600 bg-bad-50': answered && chosenIndex === index && index !== correctChoiceIndex,
                    'hover:border-practice-500 hover:bg-practice-50': !answered,
                }"
                @click="chooseOption(index)"
            >
                {{ option }}
            </button>
        </div>

        <!-- Text input -->
        <form v-else-if="isTextType && !answered" class="mt-6" @submit.prevent="submitText">
            <input
                v-model="textAnswer"
                autocomplete="off"
                :placeholder="exercise.type === 'grammar-correction'
                    ? 'Type the corrected sentence...'
                    : 'Type your answer...'"
                class="field w-full border-work-line text-center text-lg focus:border-practice-500 focus:ring-practice-500/20"
            />
            <button
                type="submit"
                class="mt-4 w-full min-h-12 rounded-2xl bg-practice-600 px-4 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40"
            >
                Check
            </button>
        </form>

        <!-- Sentence ordering -->
        <div v-else-if="exercise.type === 'sentence-ordering'" class="mt-6">
            <div class="min-h-14 rounded-xl border-2 border-dashed border-work-line p-3">
                <button
                    v-for="(originalIndex, position) in pickedPositions"
                    :key="`picked-${originalIndex}`"
                    type="button"
                    class="m-1 min-h-10 rounded-xl bg-practice-600 px-3.5 py-1.5 text-sm text-white"
                    @click="unpickSegment(position)"
                >
                    {{ exercise.segments[originalIndex] }}
                </button>
            </div>

            <div class="mt-4 flex flex-wrap justify-center gap-2">
                <button
                    v-for="originalIndex in shuffledSegmentIndexes"
                    :key="`pool-${originalIndex}`"
                    type="button"
                    class="min-h-10 rounded-xl border border-work-line bg-white px-3.5 py-1.5 text-sm transition hover:border-practice-500 hover:bg-practice-50 disabled:opacity-30"
                    :disabled="pickedPositions.includes(originalIndex) || answered"
                    @click="pickSegment(originalIndex)"
                >
                    {{ exercise.segments[originalIndex] }}
                </button>
            </div>
        </div>

        <!-- Matching -->
        <div v-else-if="exercise.type === 'matching'" class="mt-6 space-y-3">
            <div
                v-for="(pair, leftIndex) in exercise.pairs"
                :key="leftIndex"
                class="flex items-center gap-3"
            >
                <span class="flex-1 rounded-xl bg-practice-50 px-3 py-2 text-sm font-medium">
                    {{ pair.left }}
                </span>
                <select
                    v-model="matchSelection[leftIndex]"
                    class="field min-h-11 flex-1 border-work-line"
                    :disabled="answered"
                >
                    <option :value="null">Choose...</option>
                    <option
                        v-for="rightIndex in shuffledRightIndexes"
                        :key="rightIndex"
                        :value="rightIndex"
                    >
                        {{ exercise.pairs[rightIndex].right }}
                    </option>
                </select>
            </div>

            <button
                v-if="!answered"
                type="button"
                class="w-full min-h-12 rounded-2xl bg-practice-600 px-4 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40 disabled:bg-practice-600/40"
                :disabled="matchSelection.some(selection => selection === null)"
                @click="submitMatching"
            >
                Check
            </button>
        </div>

        <!-- Writing response -->
        <form
            v-else-if="exercise.type === 'writing-response' && !answered"
            class="mt-6"
            @submit.prevent="submitText"
        >
            <textarea
                v-model="textAnswer"
                rows="6"
                class="field w-full border-work-line focus:border-practice-500 focus:ring-practice-500/20"
                placeholder="Write your response..."
            />
            <button
                type="submit"
                class="mt-4 w-full min-h-12 rounded-2xl bg-practice-600 px-4 font-semibold text-white hover:bg-practice-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-practice-500/40"
            >
                Submit
            </button>
        </form>

        <!-- Result: the learner's EXACT submitted answer and the canonical
             expected answer are always shown separately — one is never
             substituted for the other. -->
        <div v-if="answered" class="mt-6 rounded-2xl border p-4" :class="result!.correct ? 'border-good-600/25 bg-good-50' : 'border-bad-600/25 bg-bad-50'" role="status">
            <p class="flex items-center gap-2 font-semibold" :class="result!.correct ? 'text-good-600' : 'text-bad-600'">
                <AppIcon :name="result!.correct ? 'check' : 'close'" :size="18" />
                {{ result!.correct ? 'Correct! Well done.' : 'Not quite' }}
            </p>

            <div class="mt-3 space-y-2 text-sm">
                <p>
                    <span class="block text-xs text-gray-500">Your answer</span>
                    <span class="font-medium text-gray-800">{{ result!.received }}</span>
                </p>
                <p>
                    <span class="block text-xs text-gray-500">Correct answer</span>
                    <span class="font-medium text-gray-800">
                        {{ answerAnalysis?.closestAccepted ?? result!.expected }}
                    </span>
                </p>
            </div>

            <!-- Dimension-separated feedback for translation / grammar-correction -->
            <div v-if="answerAnalysis" class="mt-3 space-y-2 text-sm">
                <p v-if="meaningLabel" class="text-gray-600">
                    <span class="text-xs text-gray-500">Meaning: </span>{{ meaningLabel }}
                </p>

                <div v-if="answerAnalysis.corrections.length">
                    <p class="text-xs text-gray-500">
                        What to fix ({{ answerAnalysis.corrections.length }}
                        {{ answerAnalysis.corrections.length === 1 ? 'word' : 'words' }} —
                        the rest of your sentence matches):
                    </p>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                        <span
                            v-for="(op, index) in answerAnalysis.corrections"
                            :key="index"
                            class="rounded-lg bg-white/70 px-2 py-1"
                        >
                            <template v-if="op.type === 'replace'">
                                <span class="text-red-600 line-through">{{ op.learner }}</span>
                                <span class="mx-1 text-gray-400">→</span>
                                <span class="font-medium text-green-700">{{ op.expected }}</span>
                            </template>
                            <template v-else-if="op.type === 'missing'">
                                <span class="text-gray-400">add </span>
                                <span class="font-medium text-green-700">{{ op.expected }}</span>
                            </template>
                            <template v-else-if="op.type === 'extra'">
                                <span class="text-gray-400">remove </span>
                                <span class="text-red-600 line-through">{{ op.learner }}</span>
                            </template>
                        </span>
                    </div>
                </div>
            </div>

            <p v-if="result!.feedback" class="mt-2 text-sm text-gray-600">
                <span v-if="answerAnalysis" class="text-xs text-gray-500">Topic note: </span>{{ result!.feedback }}
            </p>

            <p
                v-if="exercise.explanationPersian"
                class="mt-2 text-sm text-gray-600"
                dir="rtl"
            >
                {{ exercise.explanationPersian }}
            </p>
        </div>

        <!-- Number learning assistance (dictation) -->
        <div
            v-if="numberAnnotations.length"
            class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Numbers in this sentence
            </p>

            <div
                v-for="item in numberAnnotations"
                :key="item.digits"
                class="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm"
            >
                <span class="font-semibold text-gray-900">{{ item.digits }}</span>
                <span class="text-gray-600">{{ item.english }}</span>
                <span class="text-gray-600" dir="rtl">{{ item.persian }}</span>
            </div>

            <p class="mt-2 text-xs text-gray-400">
                {{ numberAnnotations.some(item => item.reading === 'decimal')
                    ? 'Decimals are read digit by digit after "point" (25.50 — twenty-five point five zero). '
                    : '' }}Both the digit form and the written form are accepted in your answer — but only for the same value.
            </p>
        </div>
    </div>
</template>
