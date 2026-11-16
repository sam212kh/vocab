<script setup lang="ts">
import { computed } from 'vue'

import { primaryErrors, segmentLearnerSentence } from '../../services/sentenceEvaluation'
import SpeechButton from '../ui/SpeechButton.vue'

import type { DimensionStatus, SentenceDimension, SentenceEvaluation, SentenceOutcome } from '../../types/sentenceEvaluation'

const props = defineProps<{
    evaluation: SentenceEvaluation
    provider: string
    model: string
    fallbackUsed: boolean
    correctionVisible: boolean
    canRetry: boolean
    targets: string[]
}>()

const emit = defineEmits<{
    (event: 'reveal'): void
    (event: 'retry'): void
}>()

const HEADLINES: Record<SentenceOutcome, { text: string; tone: 'good' | 'warn' | 'bad' }> = {
    correct: { text: '✓ Correct', tone: 'good' },
    'valid-alternative': { text: '✓ Correct — your own wording. It differs from the example, and that is fine.', tone: 'good' },
    unnatural: { text: '✓ Understandable and grammatical — but not how people usually say it.', tone: 'warn' },
    'needs-correction': { text: 'Needs a fix', tone: 'bad' },
    'meaning-changed': { text: 'The meaning changed from the task', tone: 'bad' },
    'off-topic': { text: "This doesn't fit the situation", tone: 'bad' },
    incomplete: { text: 'Not a complete sentence yet', tone: 'bad' },
}

const LANGUAGE_DIMENSIONS: [SentenceDimension, string][] = [
    ['grammar', 'Grammar'],
    ['vocabulary', 'Words'],
    ['wordOrder', 'Word order'],
    ['naturalness', 'Natural'],
]

const CONTENT_DIMENSIONS: [SentenceDimension, string][] = [
    ['meaning', 'Meaning'],
    ['contextRelevance', 'Fits the task'],
    ['targetExpression', 'Target phrase'],
]

const headline = computed(() => HEADLINES[props.evaluation.outcome])
const segments = computed(() => segmentLearnerSentence(props.evaluation.learnerSentence, props.evaluation.errors))
const errors = computed(() => primaryErrors(props.evaluation, 2))
const hiddenErrorCount = computed(() => Math.max(0, props.evaluation.errors.length - errors.value.length))

const showCorrection = computed(
    () => !!props.evaluation.correctedSentence && (props.evaluation.passed || props.correctionVisible)
)

function chipClass(status: DimensionStatus) {
    if (status === 'ok') return 'bg-green-50 text-green-700'
    if (status === 'minor') return 'bg-amber-50 text-amber-700'

    return 'bg-red-50 text-red-700'
}

function chipSymbol(status: DimensionStatus) {
    return status === 'ok' ? '✓' : status === 'minor' ? '~' : '✗'
}

const missedTarget = computed(() => props.evaluation.passed && props.evaluation.content.targetUsed === false)
</script>

<template>
    <div class="mt-4 space-y-3 text-sm" data-testid="sentence-feedback">
        <p class="text-xs text-gray-400">
            🤖 AI-assisted feedback · {{ provider }}<span v-if="fallbackUsed"> (fallback provider)</span>
            · practice feedback, not a certified assessment
        </p>

        <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-xs text-gray-500">Your answer</p>
            <p class="mt-1 break-words text-gray-900" dir="auto" data-testid="learner-answer">
                <template v-for="(segment, index) in segments" :key="index">
                    <mark v-if="segment.error" class="rounded bg-red-100 px-0.5 text-red-800">{{ segment.text }}</mark>
                    <template v-else>{{ segment.text }}</template>
                </template>
            </p>
        </div>

        <p
            class="font-semibold"
            :class="headline.tone === 'good' ? 'text-green-700' : headline.tone === 'warn' ? 'text-amber-700' : 'text-red-700'"
            data-testid="outcome-headline"
        >
            {{ headline.text }}
        </p>

        <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="w-16 shrink-0 text-gray-400">Language</span>
                <template v-for="[key, label] in LANGUAGE_DIMENSIONS" :key="key">
                    <span v-if="evaluation.dimensions[key].status !== 'not-applicable'" class="rounded-full px-2 py-0.5" :class="chipClass(evaluation.dimensions[key].status)">
                        {{ chipSymbol(evaluation.dimensions[key].status) }} {{ label }}
                    </span>
                </template>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="w-16 shrink-0 text-gray-400">Content</span>
                <template v-for="[key, label] in CONTENT_DIMENSIONS" :key="key">
                    <span v-if="evaluation.dimensions[key].status !== 'not-applicable'" class="rounded-full px-2 py-0.5" :class="chipClass(evaluation.dimensions[key].status)">
                        {{ chipSymbol(evaluation.dimensions[key].status) }} {{ label }}
                    </span>
                </template>
            </div>
        </div>

        <div v-for="(error, index) in errors" :key="index" class="rounded-xl border border-red-100 bg-red-50/40 p-3">
            <p class="text-gray-800">
                <b v-if="error.fragment">"{{ error.fragment }}" — </b>{{ error.explanation }}
            </p>
            <p v-if="error.explanationPersian" class="mt-1 text-gray-600" dir="rtl">{{ error.explanationPersian }}</p>
        </div>
        <p v-if="hiddenErrorCount" class="text-xs text-gray-400">+ {{ hiddenErrorCount }} smaller note{{ hiddenErrorCount === 1 ? '' : 's' }} — fix the main point first.</p>

        <p v-if="evaluation.explanationPersian && !errors.some(error => error.explanationPersian)" class="rounded-xl bg-gray-50 p-3 text-gray-600" dir="rtl">
            {{ evaluation.explanationPersian }}
        </p>

        <p v-if="missedTarget" class="text-xs text-amber-700">
            Valid sentence. You didn't use the target phrase — try it next time: <b>{{ targets.join(', ') }}</b>
        </p>

        <div v-if="showCorrection" class="rounded-xl border border-green-100 bg-green-50/50 p-3" data-testid="correction">
            <p class="text-xs text-green-700">{{ evaluation.passed ? 'A more natural way' : 'Natural correction' }}</p>
            <p class="mt-1 font-medium text-gray-900">
                {{ evaluation.correctedSentence }} <SpeechButton :text="evaluation.correctedSentence" lang="en-US" />
            </p>
            <p v-if="evaluation.example" class="mt-2 text-xs text-gray-500">e.g. {{ evaluation.example }}</p>
        </div>

        <p v-if="evaluation.passed && evaluation.alternatives.length" class="text-xs text-gray-500">
            Other valid ways: {{ evaluation.alternatives.slice(0, 2).join(' · ') }}
        </p>

        <p v-if="evaluation.nextPractice" class="text-xs text-gray-400">Next: {{ evaluation.nextPractice }}</p>

        <div v-if="!evaluation.passed" class="flex flex-col gap-2 sm:flex-row">
            <button v-if="canRetry" type="button" class="flex-1 rounded-xl bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800" data-testid="retry" @click="emit('retry')">
                Try again{{ correctionVisible ? '' : ' (without the correction)' }}
            </button>
            <button v-if="!correctionVisible && evaluation.correctedSentence" type="button" class="flex-1 rounded-xl border px-4 py-3 text-gray-600 hover:bg-gray-50" data-testid="reveal" @click="emit('reveal')">
                Show natural correction
            </button>
        </div>
    </div>
</template>
