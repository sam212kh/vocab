<script setup lang="ts">
import { ref } from 'vue'

import { requestAssist } from '../../services/conversationService'
import { useSavedExpressionsStore } from '../../stores/savedExpressions'
import { useConversationsStore } from '../../stores/conversations'
import SpeechButton from '../ui/SpeechButton.vue'

import type { ConversationMessage } from '../../types/conversation'

const props = defineProps<{
    message: ConversationMessage
    sessionId: string
}>()

const savedExpressionsStore = useSavedExpressionsStore()
const conversationsStore = useConversationsStore()

const showActions = ref(false)
const showCorrections = ref(true)
const assistKind = ref<'explain' | 'simplify' | null>(null)
const assistReply = ref('')
const assistLoading = ref(false)
const assistError = ref('')

async function translate() {
    if (props.message.translation || assistLoading.value) return

    assistLoading.value = true
    assistError.value = ''

    try {
        const translation = await requestAssist('translate', props.message.text)
        conversationsStore.setTranslation(props.sessionId, props.message.id, translation)
    } catch (err) {
        assistError.value = err instanceof Error ? err.message : 'Translation failed'
    } finally {
        assistLoading.value = false
    }
}

async function assist(kind: 'explain' | 'simplify') {
    if (assistLoading.value) return

    if (assistKind.value === kind && assistReply.value) {
        assistKind.value = null
        assistReply.value = ''
        return
    }

    assistLoading.value = true
    assistError.value = ''
    assistKind.value = kind

    try {
        assistReply.value = await requestAssist(kind, props.message.text)
    } catch (err) {
        assistError.value = err instanceof Error ? err.message : 'Request failed'
        assistKind.value = null
    } finally {
        assistLoading.value = false
    }
}

function saveExpression() {
    savedExpressionsStore.saveExpression(props.message.text, '', '', props.sessionId)
}
</script>

<template>
    <div :class="message.role === 'learner' ? 'flex justify-end' : 'flex justify-start'">
        <div class="max-w-[85%] sm:max-w-[75%]">
            <!-- Bubble -->
            <div
                class="rounded-2xl px-4 py-2.5"
                :class="message.role === 'learner'
                    ? 'rounded-br-sm bg-gray-900 text-white'
                    : 'rounded-bl-sm border border-gray-200 bg-white text-gray-900 shadow-sm'"
            >
                <p class="whitespace-pre-wrap leading-relaxed" dir="auto">{{ message.text }}</p>

                <p
                    v-if="message.role === 'learner' && message.inputMethod === 'voice'"
                    class="mt-1 text-xs text-gray-400"
                >
                    🎙 spoken
                </p>
            </div>

            <!-- Tutor message tools -->
            <div v-if="message.role === 'tutor'" class="mt-1 flex items-center gap-1 text-xs">
                <SpeechButton :text="message.text" lang="en-US" />
                <button type="button" class="rounded px-1.5 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" @click="showActions = !showActions">
                    {{ showActions ? '×' : '⋯' }}
                </button>

                <template v-if="showActions">
                    <button type="button" class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100" :disabled="assistLoading" @click="translate">
                        ترجمه
                    </button>
                    <button type="button" class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100" :disabled="assistLoading" @click="assist('explain')">
                        Explain
                    </button>
                    <button type="button" class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100" :disabled="assistLoading" @click="assist('simplify')">
                        Simpler
                    </button>
                    <button type="button" class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100" @click="saveExpression">
                        ☆ Save
                    </button>
                </template>

                <span v-if="assistLoading" class="text-gray-400">…</span>
            </div>

            <!-- Assist output -->
            <p v-if="message.translation" class="mt-1 rounded-lg bg-gray-50 p-2 text-sm text-gray-600" dir="rtl">
                {{ message.translation }}
            </p>
            <p v-if="assistReply" class="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-sm text-gray-600" dir="auto">
                {{ assistReply }}
            </p>
            <p v-if="assistError" class="mt-1 text-xs text-red-500">{{ assistError }}</p>

            <!-- Corrections on learner messages -->
            <div v-if="message.corrections.length" class="mt-1">
                <button
                    type="button"
                    class="text-xs text-amber-600 hover:text-amber-800"
                    @click="showCorrections = !showCorrections"
                >
                    {{ showCorrections ? '▾' : '▸' }} {{ message.corrections.length }}
                    {{ message.corrections.length === 1 ? 'correction' : 'corrections' }}
                </button>

                <div v-if="showCorrections" class="mt-1 space-y-2">
                    <div
                        v-for="(correction, index) in message.corrections"
                        :key="index"
                        class="rounded-xl border p-3 text-sm"
                        :class="correction.kind === 'error' ? 'border-red-100 bg-red-50/50' : 'border-blue-100 bg-blue-50/50'"
                    >
                        <div class="flex items-center gap-2 text-xs">
                            <span
                                class="rounded-full px-1.5 py-0.5 font-medium"
                                :class="correction.kind === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'"
                            >{{ correction.kind === 'error' ? 'error' : 'style' }}</span>
                            <span class="text-gray-400">{{ correction.category }}</span>
                        </div>

                        <p class="mt-1.5 text-gray-500 line-through decoration-red-300">{{ correction.original }}</p>
                        <p class="font-medium text-gray-900">{{ correction.corrected }}</p>
                        <p v-if="correction.natural && correction.natural !== correction.corrected" class="text-gray-600">
                            <span class="text-xs text-gray-400">more natural:</span> {{ correction.natural }}
                        </p>

                        <p class="mt-1 text-gray-600">{{ correction.explanation }}</p>
                        <p v-if="correction.explanationPersian" class="mt-1 rounded bg-white/60 p-1.5 text-gray-600" dir="rtl">
                            {{ correction.explanationPersian }}
                        </p>
                        <p v-if="correction.example" class="mt-1 text-xs text-gray-400">e.g. {{ correction.example }}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
