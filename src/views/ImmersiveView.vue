<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from '../components/ui/AppIcon.vue'
import MessageBubble from '../components/conversation/MessageBubble.vue'
import SpeechButton from '../components/ui/SpeechButton.vue'
import { loadImmersiveManifest, loadImmersiveScenario, nextDifficulty, scenarioComplete } from '../services/immersiveScenario'
import { requestTutorTurn } from '../services/conversationService'
import { evidenceForTurn } from '../services/conversationEvidence'
import { AIClientError } from '../services/aiClient'
import { useConversationsStore } from '../stores/conversations'
import { useAISettingsStore } from '../stores/aiSettings'
import { useMistakesStore } from '../stores/mistakes'
import { usePerformanceStore } from '../stores/performance'
import { useImmersiveProgressStore } from '../stores/immersiveProgress'
import { useSpeakingPractice } from '../composables/useSpeakingPractice'
import type { ImmersiveScenario, ImmersiveStage, ImmersiveFeedbackMode } from '../types/immersive'
import type { ConversationSession, RoleplayScenario } from '../types/conversation'
import type { CefrLevel } from '../types/cefr'

const conversations = useConversationsStore()
const ai = useAISettingsStore()
const mistakes = useMistakesStore()
const performance = usePerformanceStore()
const progress = useImmersiveProgressStore()
const voice = useSpeakingPractice()

const scenarios = ref<Awaited<ReturnType<typeof loadImmersiveManifest>>>([])
const scenario = ref<ImmersiveScenario | null>(null)
const session = ref<ConversationSession | null>(null)
const stage = ref<ImmersiveStage | null>(null)
const draft = ref('')
const fromVoice = ref(false)
const voiceConfidence = ref<number | null>(null)
const loading = ref(false)
const error = ref('')
const loadError = ref('')
const feedbackMode = ref<ImmersiveFeedbackMode>('gentle')
const completed = ref(false)
const chatBox = ref<HTMLElement | null>(null)

const roleplay = computed<RoleplayScenario | null>(() => scenario.value ? ({
    id: scenario.value.id, title: scenario.value.title, mode: 'roleplay', aiRole: scenario.value.aiRole,
    learnerRole: scenario.value.learnerRole, objective: scenario.value.objective, context: scenario.value.situation,
    vocabulary: scenario.value.vocabulary, completionCriteria: scenario.value.completionCriteria, opening: scenario.value.opening,
}) : null)
const messages = computed(() => session.value?.messages ?? [])
const currentStageIndex = computed(() => scenario.value && stage.value ? scenario.value.stages.findIndex(item => item.id === stage.value?.id) + 1 : 0)

function scroll() { void nextTick(() => chatBox.value?.scrollTo({ top: chatBox.value.scrollHeight })) }
function describeError(err: unknown) {
    if (err instanceof AIClientError) return err.message
    return err instanceof Error ? err.message : 'The scenario could not continue. Your progress is saved.'
}
function selectStage(id: string) { stage.value = scenario.value?.stages.find(item => item.id === id) ?? stage.value }

async function start(id: string) {
    loadError.value = ''; error.value = ''; completed.value = false
    try {
        const loaded = await loadImmersiveScenario(id)
        scenario.value = loaded
        const prior = progress.forScenario(id)
        const difficulty = nextDifficulty(loaded.difficulty ?? 2, prior?.completed ?? 0, 0)
        progress.recordAttempt(id, difficulty)
        const created = conversations.startSession({ mode: 'roleplay', scenarioId: id, difficulty: (loaded.cefrLevel ?? 'A2') as CefrLevel, feedbackMode: feedbackMode.value })
        session.value = created
        stage.value = loaded.stages[0] ?? null
        conversations.appendMessage(created.id, { role: 'tutor', text: loaded.opening, inputMethod: null, voiceConfidence: null, corrections: [], translation: null })
        scroll()
    } catch (err) { loadError.value = describeError(err) }
}

async function send(text = draft.value, method: 'text' | 'voice' = fromVoice.value ? 'voice' : 'text', confidence = voiceConfidence.value) {
    const active = session.value
    if (!active || loading.value || !text.trim() || !roleplay.value) return
    const learner = conversations.appendMessage(active.id, { role: 'learner', text: text.trim(), inputMethod: method, voiceConfidence: confidence, corrections: [], translation: null })
    draft.value = ''; fromVoice.value = false; voiceConfidence.value = null; loading.value = true; error.value = ''; scroll()
    try {
        const turn = await requestTutorTurn(active, roleplay.value)
        if (learner && turn.corrections.length) {
            conversations.setCorrections(active.id, learner.id, turn.corrections)
            mistakes.recordFromEvaluation(`${active.id}:${learner.id}`, turn.corrections.map(item => ({ original: item.original, corrected: item.corrected, category: item.category, kind: item.kind, explanation: item.explanation, explanationPersian: item.explanationPersian, example: item.example })))
        }
        if (learner) for (const event of evidenceForTurn({ mode: 'roleplay', scenarioId: active.scenarioId, feedbackMode: active.feedbackMode, inputMethod: method, voiceConfidence: confidence, corrections: turn.corrections })) performance.record(event)
        conversations.appendMessage(active.id, { role: 'tutor', text: turn.reply, inputMethod: null, voiceConfidence: null, corrections: [], translation: null })
        if (scenario.value && scenarioComplete(active.messages.filter(item => item.role === 'learner').length, scenario.value.stages.length)) {
            completed.value = true; progress.recordCompletion(scenario.value.id, scenario.value.difficulty ?? 2)
        }
    } catch (err) { error.value = describeError(err) }
    finally { loading.value = false; scroll() }
}
function choose(choice: { response: string; nextStage: string }) { selectStage(choice.nextStage); void send(choice.response, 'text', null) }
async function recordVoice() { if (voice.isSupported && !voice.isListening.value) { voice.reset(); await voice.startListening(); if (voice.transcript.value) { draft.value = voice.transcript.value; fromVoice.value = true; voiceConfidence.value = voice.confidence.value || null } } }
function changeFeedback(mode: ImmersiveFeedbackMode) { feedbackMode.value = mode; if (session.value) conversations.changeFeedbackMode(session.value.id, mode) }
function reset() { if (session.value) conversations.endSession(session.value.id); session.value = null; scenario.value = null; stage.value = null; completed.value = false; draft.value = '' }

onMounted(async () => { try { scenarios.value = await loadImmersiveManifest() } catch (err) { loadError.value = describeError(err) } })
</script>

<template>
    <div class="mx-auto max-w-5xl">
        <div v-if="!session" class="space-y-6">
            <div><p class="text-sm font-semibold uppercase tracking-wide text-accent">Immersive English</p><h1 class="mt-2">Practice English in real situations</h1><p class="mt-2 max-w-2xl text-gray-500">Talk to a character, make decisions, and solve a practical communication problem.</p></div>
            <p v-if="loadError" class="rounded-xl bg-red-50 p-4 text-red-700">{{ loadError }}</p>
            <div class="grid gap-4 md:grid-cols-2">
                <button v-for="item in scenarios" :key="item.id" type="button" class="rounded-2xl border border-gray-200 bg-white p-5 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-accent" @click="start(item.id)">
                    <div class="flex items-start justify-between gap-4"><div><h2 class="text-lg font-semibold">{{ item.title }}</h2><p class="mt-1 text-sm text-gray-500" dir="rtl">{{ item.titlePersian }}</p></div><span class="rounded-full bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink">{{ item.cefrLevel }}</span></div>
                    <p class="mt-4 text-sm text-gray-600">{{ item.category }} · {{ item.estimatedDuration }} min</p>
                    <p v-if="progress.forScenario(item.id)?.completed" class="mt-3 text-sm text-emerald-700">Completed {{ progress.forScenario(item.id)?.completed }} time(s) · Replay available</p>
                </button>
            </div>
        </div>
        <div v-else class="flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><button type="button" class="text-sm text-gray-500 hover:text-gray-900" @click="reset">← Scenarios</button><h1 class="mt-2 text-2xl">{{ scenario?.title }}</h1><p class="mt-1 text-sm text-gray-500" dir="rtl">{{ scenario?.situationPersian }}</p></div><div class="flex items-center gap-2"><label class="text-sm text-gray-500" for="immersive-feedback">Feedback</label><select id="immersive-feedback" :value="feedbackMode" class="rounded-lg border-gray-300 text-sm" @change="changeFeedback(($event.target as HTMLSelectElement).value as ImmersiveFeedbackMode)"><option value="natural">Natural</option><option value="gentle">Gentle</option><option value="teacher">Teacher</option></select></div></div>
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]"><section class="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-gray-50 p-3"><div ref="chatBox" class="min-h-[22rem] flex-1 space-y-3 overflow-y-auto p-2"><MessageBubble v-for="message in messages" :key="message.id" :message="message" :session-id="session.id" /></div><div v-if="stage" class="rounded-xl border border-accent/20 bg-white p-3"><p class="text-sm font-medium">Stage {{ currentStageIndex }}: {{ stage.prompt }}</p><p class="mt-1 text-xs text-gray-500" dir="rtl">{{ stage.promptPersian }}</p><div v-if="stage.choices?.length" class="mt-3 flex flex-wrap gap-2"><button v-for="choice in stage.choices" :key="choice.id" type="button" class="rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent-ink hover:bg-accent-soft" :disabled="loading" @click="choose(choice)">{{ choice.label }}</button></div></div><p v-if="error" class="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p><div class="mt-3 flex gap-2"><textarea v-model="draft" rows="2" class="min-w-0 flex-1 resize-none rounded-xl border-gray-300" placeholder="Respond in English…" @keydown.ctrl.enter="send()" /><button type="button" class="rounded-xl border border-gray-300 px-3" :disabled="!voice.isSupported || voice.isListening.value" :aria-label="voice.isListening.value ? 'Listening' : 'Record voice'" @click="recordVoice">{{ voice.isListening.value ? '…' : '🎙' }}</button><button type="button" class="rounded-xl bg-accent px-4 font-semibold text-white disabled:opacity-50" :disabled="loading || !draft.trim()" @click="send()">{{ loading ? '…' : 'Send' }}</button></div><p v-if="voice.error" class="mt-1 text-xs text-red-600">{{ voice.error }}</p></section><aside class="space-y-4"><div class="rounded-2xl border border-gray-200 bg-white p-4"><h2 class="font-semibold">Useful language</h2><div class="mt-3 space-y-2"><div v-for="item in scenario?.usefulExpressions" :key="item.english" class="text-sm"><p>{{ item.english }} <SpeechButton :text="item.english" /></p><p class="text-gray-500" dir="rtl">{{ item.persian }}</p></div></div></div><div class="rounded-2xl border border-gray-200 bg-white p-4"><h2 class="font-semibold">Your objective</h2><p class="mt-2 text-sm text-gray-600">{{ scenario?.objective }}</p><p class="mt-2 text-xs text-gray-500">{{ scenario?.completionCriteria }}</p></div><div v-if="completed" class="rounded-2xl bg-emerald-50 p-4 text-emerald-800"><p class="font-semibold">Scenario complete</p><p class="mt-1 text-sm">You communicated the main request. Replay it to try with fewer hints.</p><button type="button" class="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" @click="reset">Try another scenario</button></div></aside></div>
        </div>
    </div>
</template>
