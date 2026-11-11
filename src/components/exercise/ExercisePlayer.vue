<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { shuffle, validateAnswer } from '../../services/exerciseEngine'
import { annotateNumbers } from '../../services/numbers'
import SpeechButton from '../ui/SpeechButton.vue'

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
            class="mb-4 flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-4"
        >
            <span class="text-sm text-gray-500">Listen:</span>
            <SpeechButton :text="exercise.audioText" lang="en-US" />
        </div>

        <!-- Prompt -->
        <div class="text-center">
            <p v-if="exercise.type === 'fill-blank'" class="text-lg leading-relaxed">
                {{ exercise.before }}
                <span class="mx-1 inline-block min-w-24 rounded border-b-2 border-gray-400 px-2 font-semibold">
                    {{ answered ? result!.expected : '______' }}
                </span>
                {{ exercise.after }}
            </p>

            <p v-else-if="exercise.type === 'translation'" class="text-xl font-semibold" dir="auto">
                {{ exercise.source }}
            </p>

            <p v-else-if="exercise.type === 'grammar-correction'" class="text-lg">
                Correct this sentence:
                <span class="mt-2 block rounded-xl bg-red-50 p-3 font-medium text-red-800">
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
                class="rounded-xl border p-4 text-left transition"
                :class="{
                    'border-green-500 bg-green-50': answered && index === correctChoiceIndex,
                    'border-red-500 bg-red-50': answered && chosenIndex === index && index !== correctChoiceIndex,
                    'hover:bg-gray-50': !answered,
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
                class="w-full rounded-xl border px-4 py-3 text-center text-lg outline-none focus:border-gray-900"
            />
            <button
                type="submit"
                class="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700"
            >
                Check
            </button>
        </form>

        <!-- Sentence ordering -->
        <div v-else-if="exercise.type === 'sentence-ordering'" class="mt-6">
            <div class="min-h-14 rounded-xl border-2 border-dashed border-gray-200 p-3">
                <button
                    v-for="(originalIndex, position) in pickedPositions"
                    :key="`picked-${originalIndex}`"
                    type="button"
                    class="m-1 rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white"
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
                    class="rounded-lg border px-3 py-1.5 text-sm transition hover:bg-gray-50 disabled:opacity-30"
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
                <span class="flex-1 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium">
                    {{ pair.left }}
                </span>
                <select
                    v-model="matchSelection[leftIndex]"
                    class="flex-1 rounded-lg border px-3 py-2 text-sm"
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
                class="w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
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
                class="w-full rounded-xl border px-4 py-3 outline-none focus:border-gray-900"
                placeholder="Write your response..."
            />
            <button
                type="submit"
                class="mt-4 w-full rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-700"
            >
                Submit
            </button>
        </form>

        <!-- Result: the learner's EXACT submitted answer and the canonical
             expected answer are always shown separately — one is never
             substituted for the other. -->
        <div v-if="answered" class="mt-6 rounded-xl p-4" :class="result!.correct ? 'bg-green-50' : 'bg-red-50'">
            <p class="font-semibold" :class="result!.correct ? 'text-green-700' : 'text-red-700'">
                {{ result!.correct ? '✅ Correct! Well done.' : '❌ Not quite' }}
            </p>

            <div class="mt-3 space-y-2 text-sm">
                <p>
                    <span class="block text-xs text-gray-500">Your answer</span>
                    <span class="font-medium text-gray-800">{{ result!.received }}</span>
                </p>
                <p>
                    <span class="block text-xs text-gray-500">Correct answer</span>
                    <span class="font-medium text-gray-800">{{ result!.expected }}</span>
                </p>
            </div>

            <p v-if="result!.feedback" class="mt-2 text-sm text-gray-600">
                {{ result!.feedback }}
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
