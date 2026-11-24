<script setup lang="ts">
import { ref } from 'vue'

import PageHeader from '../components/ui/PageHeader.vue'
import { requestCoachAnswer } from '../services/conversationService'
import { AIClientError } from '../services/aiClient'
import { useAISettingsStore } from '../stores/aiSettings'

const aiSettings = useAISettingsStore()
const question = ref('')
const answer = ref('')
const error = ref('')
const waiting = ref(false)

const suggestions = [
    'What should I practice today?',
    'Why do I keep making this mistake?',
    'How can I say this more naturally?',
    'Help me improve my speaking.',
]

function describeError(value: unknown): string {
    if (value instanceof AIClientError) {
        if (value.code === 'gateway-unreachable') return 'The AI service is not reachable. Your learning data is safe; check AI Settings or try again later.'
        if (value.code === 'timeout') return 'The coach took too long to respond. Try a shorter question.'
        if (value.code === 'rate-limited') return 'The AI service is rate-limited. Please try again shortly.'
    }

    return 'The coach could not answer right now. Please try again.'
}

async function ask(value = question.value) {
    const text = value.trim()
    if (!text || waiting.value) return

    question.value = text
    error.value = ''
    answer.value = ''
    waiting.value = true

    try {
        answer.value = await requestCoachAnswer(text)
    } catch (err) {
        error.value = describeError(err)
    } finally {
        waiting.value = false
    }
}
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-6">
        <PageHeader
            eyebrow="AI Coach"
            title="A coach who knows your learning evidence"
            serif
            description="Ask for a practical explanation or next step. The coach uses your saved goals, review state, recurring mistakes and communication evidence; it does not invent a level or diagnose you from one answer."
            description-persian="دربارهٔ یادگیری‌ات سؤال بپرس. مربی از هدف‌ها، مرورها، اشتباه‌های تکرارشونده و شواهد ارتباطی ذخیره‌شده استفاده می‌کند و از یک پاسخ، سطح یا ضعف ساختگی نتیجه نمی‌گیرد."
        />

        <section class="surface p-5 sm:p-6" aria-labelledby="coach-question-title">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 id="coach-question-title" class="label">Ask your coach</h2>
                <RouterLink to="/progress" class="text-sm font-semibold text-accent-ink hover:underline">View evidence</RouterLink>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
                <button
                    v-for="suggestion in suggestions"
                    :key="suggestion"
                    type="button"
                    class="rounded-full border border-gray-200 px-3 py-2 text-left text-sm text-gray-600 transition hover:border-accent hover:bg-accent-soft"
                    :disabled="waiting"
                    @click="ask(suggestion)"
                >
                    {{ suggestion }}
                </button>
            </div>

            <form class="mt-5 space-y-3" @submit.prevent="ask()">
                <label for="coach-question" class="sr-only">Your question</label>
                <textarea
                    id="coach-question"
                    v-model="question"
                    rows="4"
                    maxlength="1000"
                    class="field w-full resize-y"
                    placeholder="Ask about a mistake, a phrase, or what to practise next…"
                    :disabled="waiting"
                />
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-xs text-gray-400">{{ aiSettings.settings.enabled ? 'Uses your local learning evidence only.' : 'Enable AI in AI Settings to ask the coach.' }}</p>
                    <button type="submit" class="btn-primary" :disabled="waiting || !question.trim() || !aiSettings.settings.enabled">
                        {{ waiting ? 'Thinking…' : 'Ask coach' }}
                    </button>
                </div>
            </form>
        </section>

        <section v-if="answer || error" class="surface p-5 sm:p-6" aria-live="polite">
            <h2 class="label">Coach response</h2>
            <p v-if="error" class="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{{ error }}</p>
            <div v-else class="mt-4 whitespace-pre-wrap leading-relaxed text-gray-800">{{ answer }}</div>
        </section>
    </div>
</template>
