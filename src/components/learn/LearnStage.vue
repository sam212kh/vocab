<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

import AppIcon from '../ui/AppIcon.vue'
import BottomSheet from '../ui/BottomSheet.vue'
import LearningIllustration from '../art/LearningIllustration.vue'
import ExpressionPresentation from './ExpressionPresentation.vue'
import LessonHeader from './LessonHeader.vue'
import LessonNavigation from './LessonNavigation.vue'
import LessonProgress from './LessonProgress.vue'
import VocabularyPopover from './VocabularyPopover.vue'

import { buildLexicon, clampIndex } from '../../services/learnItems'
import type { LearnItem, LexiconEntry } from '../../services/learnItems'

export interface LearnAction {
    key: string
    label: string
    to?: RouteLocationRaw
    primary?: boolean
}

/**
 * The LEARN environment: one expression at a time, everything visible,
 * audio on demand, free movement in both directions. No scoring, no timers,
 * no forced answers — practice is a separate mode.
 */
const props = withDefaults(defineProps<{
    items: LearnItem[]
    eyebrow?: string
    title: string
    subtitle?: string
    meta?: string[]
    scene?: string
    seed?: string
    backTo?: RouteLocationRaw
    backLabel?: string
    initialIndex?: number
    isSaved: (item: LearnItem) => boolean
    saveLabel: string
    persianAudio?: boolean
    stats?: { studied: number; total: number; mastered: number }
    bookImages?: string[]
    actions: LearnAction[]
    finishLabel?: string
    /** Render inside a bordered paper panel (when embedded in another page). */
    framed?: boolean
    hideBack?: boolean
}>(), { eyebrow: 'Learn', initialIndex: 0 })

const emit = defineEmits<{
    save: [item: LearnItem]
    action: [key: string]
    'update:index': [index: number]
    complete: []
    back: []
}>()

const index = ref(clampIndex(props.initialIndex, props.items.length))
const visited = ref<boolean[]>(props.items.map((_, i) => i === index.value))
const done = ref(false)
/* Stored as an index: a ref would wrap an item in a reactive proxy and break identity checks. */
const lookupIndex = ref<number | null>(null)
const showContents = ref(false)
const showBook = ref(false)

const lexicon = computed(() => buildLexicon(props.items))
const current = computed(() => props.items[index.value])
const lookup = computed<LearnItem | null>(() => (lookupIndex.value === null ? null : props.items[lookupIndex.value] ?? null))

watch(() => props.items.length, count => {
    index.value = clampIndex(index.value, count)
    visited.value = Array.from({ length: count }, (_, i) => visited.value[i] ?? i === index.value)
})

function go(target: number) {
    const next = clampIndex(target, props.items.length)

    done.value = false
    showContents.value = false
    index.value = next
    visited.value[next] = true
    emit('update:index', next)
}

function next() {
    if (index.value >= props.items.length - 1) {
        done.value = true
        emit('complete')
        return
    }

    go(index.value + 1)
}

function prev() {
    if (done.value) {
        done.value = false
        return
    }

    go(index.value - 1)
}

function onLookup(entry: LexiconEntry) {
    lookupIndex.value = entry.itemIndex
}

function openFromLookup() {
    const target = lookupIndex.value

    lookupIndex.value = null

    if (target !== null) go(target)
}

function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null

    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    if (lookup.value || showContents.value || showBook.value || event.metaKey || event.ctrlKey || event.altKey) return

    if (event.key === 'ArrowRight') next()
    else if (event.key === 'ArrowLeft') prev()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/* The persistent contents rail needs a wide page; embedded (framed) stages use the sheet instead. */
const rail = computed(() => !props.framed)

const savedCount = computed(() => props.items.filter(item => props.isSaved(item)).length)
</script>

<template>
    <div :class="framed ? 'rounded-3xl border border-line bg-paper p-4 sm:p-6' : ''">
        <LessonHeader
            :eyebrow="eyebrow"
            :title="title"
            :subtitle="subtitle"
            :meta="meta"
            :scene="scene"
            :seed="seed"
            :back-to="backTo"
            :back-label="backLabel"
            :has-book-page="!!bookImages?.length"
            :hide-back="hideBack"
            @back="emit('back')"
            @book-page="showBook = true"
        />

        <div class="mt-5 grid gap-6" :class="rail ? 'lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-10' : ''">
            <!-- Desktop: persistent contents rail -->
            <aside v-if="rail" class="hidden lg:block" aria-label="Lesson contents">
                <div class="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1">
                    <LessonProgress :current="index" :total="items.length" :visited="visited" :stats="stats" />
                    <div class="mt-4">
                        <LessonNavigation
                            mode="list"
                            :items="items"
                            :current="done ? -1 : index"
                            :total="items.length"
                            :visited="visited"
                            :is-saved="isSaved"
                            @go="go"
                        />
                    </div>
                </div>
            </aside>

            <div class="min-w-0">
                <div class="mb-4" :class="rail ? 'lg:hidden' : ''">
                    <LessonProgress :current="index" :total="items.length" :visited="visited" :stats="stats" />
                </div>

                <p class="sr-only" aria-live="polite">{{ done ? 'Lesson finished' : `Expression ${index + 1} of ${items.length}: ${current?.text}` }}</p>

                <div class="mx-auto max-w-2xl">
                    <Transition
                        mode="out-in"
                        enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
                        leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
                        enter-from-class="opacity-0 translate-y-1.5"
                        leave-to-class="opacity-0"
                    >
                        <ExpressionPresentation
                            v-if="!done && current"
                            :key="current.id"
                            :item="current"
                            :index="index"
                            :total="items.length"
                            :lexicon="lexicon"
                            :saved="isSaved(current)"
                            :save-label="saveLabel"
                            :persian-audio="persianAudio"
                            @save="emit('save', current)"
                            @lookup="onLookup"
                        />

                        <!-- Completion: a hand-off, not a result -->
                        <section v-else-if="done" key="done" class="rounded-3xl border border-line bg-white p-6 text-center shadow-soft sm:p-10">
                            <div class="mx-auto h-24 w-40 overflow-hidden rounded-2xl border border-line" aria-hidden="true">
                                <LearningIllustration :scene="scene" :seed="seed || title" />
                            </div>
                            <h2 class="font-display mt-5 text-2xl font-semibold text-ink">You've met all {{ items.length }} expressions</h2>
                            <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
                                <template v-if="savedCount">{{ savedCount }} saved for later. </template>
                                Come back and listen as often as you like. Practice is a different mode: the answers disappear and you recall them yourself.
                            </p>

                            <div class="mt-6 flex flex-col items-stretch gap-2 sm:mx-auto sm:max-w-xs">
                                <template v-for="action in actions.filter(item => item.primary)" :key="action.key">
                                    <RouterLink
                                        v-if="action.to"
                                        :to="action.to"
                                        class="flex min-h-12 items-center justify-center rounded-2xl bg-learn-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-learn-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/40"
                                    >{{ action.label }}</RouterLink>
                                    <button
                                        v-else
                                        type="button"
                                        class="flex min-h-12 items-center justify-center rounded-2xl bg-learn-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-learn-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/40"
                                        @click="emit('action', action.key)"
                                    >{{ action.label }}</button>
                                </template>

                                <button
                                    type="button"
                                    class="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-line px-5 text-sm font-medium text-ink-soft hover:bg-paper-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-learn-500/30"
                                    @click="go(0)"
                                >
                                    <AppIcon name="refresh" :size="16" /> Review from the start
                                </button>
                            </div>

                            <p v-if="actions.some(item => !item.primary)" class="mt-5 flex flex-wrap items-center justify-center gap-x-1 gap-y-0 text-sm text-ink-soft">
                                <span class="mr-1 text-ink-faint">Or try</span>
                                <template v-for="action in actions.filter(item => !item.primary)" :key="action.key">
                                    <RouterLink
                                        v-if="action.to"
                                        :to="action.to"
                                        class="inline-flex min-h-11 items-center rounded-full px-2.5 font-medium text-learn-700 hover:bg-learn-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-learn-500"
                                    >{{ action.label }}</RouterLink>
                                    <button
                                        v-else
                                        type="button"
                                        class="inline-flex min-h-11 items-center rounded-full px-2.5 font-medium text-learn-700 hover:bg-learn-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-learn-500"
                                        @click="emit('action', action.key)"
                                    >{{ action.label }}</button>
                                </template>
                            </p>
                        </section>
                    </Transition>
                </div>

                <!-- Sticky controls: always reachable, never over the content -->
                <div
                    v-if="!done"
                    class="sticky bottom-0 z-30 -mx-4 mt-5 bg-gradient-to-t from-paper from-70% to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 sm:mx-0 sm:px-0"
                    :class="framed ? '!mx-0 !px-0' : ''"
                >
                    <div class="mx-auto max-w-2xl">
                        <LessonNavigation
                            mode="bar"
                            :rail="rail"
                            :current="index"
                            :total="items.length"
                            :finish-label="finishLabel"
                            @prev="prev"
                            @next="next"
                            @contents="showContents = true"
                        />
                    </div>
                </div>
            </div>
        </div>

        <VocabularyPopover
            :item="lookup"
            :can-open="lookupIndex !== null && lookupIndex !== index"
            :saved="!!lookup && isSaved(lookup)"
            @close="lookupIndex = null"
            @open="openFromLookup"
            @save="lookup && emit('save', lookup)"
        />

        <!-- Contents sheet (phones/tablets) -->
        <BottomSheet :open="showContents" title="Expressions" @close="showContents = false">
            <LessonNavigation mode="list" :items="items" :current="index" :total="items.length" :visited="visited" :is-saved="isSaved" @go="go" />
        </BottomSheet>

        <!-- Book page viewer: heavy images load only when asked for -->
        <Teleport to="body">
            <div v-if="showBook" class="fixed inset-0 z-50 flex flex-col bg-ink/60" role="dialog" aria-modal="true" aria-label="Book page">
                <div class="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
                    <p class="font-display text-lg">Book page</p>
                    <button type="button" class="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close book page" @click="showBook = false">
                        <AppIcon name="close" />
                    </button>
                </div>
                <div class="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-6">
                    <img v-for="image in bookImages" :key="image" :src="image" :alt="`${title} — book page`" loading="lazy" decoding="async" class="mb-3 w-full rounded-2xl bg-white" />
                </div>
            </div>
        </Teleport>
    </div>
</template>
