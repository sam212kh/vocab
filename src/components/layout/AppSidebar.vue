<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../ui/AppIcon.vue'
import { useRoute } from 'vue-router'
import {
    getSpeechProvider,
    getSpeechRate,
    getSpeechVoice,
    getSpeechVoices,
    loadSpeechVoices,
    setSpeechProvider,
    setSpeechRate,
    setSpeechVoice,
} from '../../services/speech'
import type { SpeechRate } from '../../services/speech'
import { useLocale } from '../../services/locale'

const props = defineProps<{
    /** Mobile drawer visibility — owned by App.vue's sticky header. */
    open: boolean
}>()

const emit = defineEmits<{
    close: []
}>()

const route = useRoute()
const { t, isPersian, locale, setLocale } = useLocale()
const speechProvider = ref(getSpeechProvider())
watch(speechProvider, setSpeechProvider)
const speechRate = ref<SpeechRate>(getSpeechRate())
watch(speechRate, setSpeechRate)
const speechVoice = ref(getSpeechVoice())
const speechVoices = ref(getSpeechVoices())
watch(speechVoice, setSpeechVoice)
onMounted(async () => {
    speechVoices.value = await loadSpeechVoices()
    if (!speechVoices.value.some(voice => voice.id === speechVoice.value)) {
        speechVoice.value = speechVoices.value[0]?.id ?? speechVoice.value
    }
})

type SectionKey = 'today' | 'learn' | 'practice' | 'career' | 'me'

interface NavItem {
    labelKey: string
    icon: string
    route: string
    /** Extra path prefixes that keep this item highlighted (e.g. lesson pages under Lessons). */
    also?: string[]
}

interface NavSection {
    key: SectionKey
    titleKey: string
    items: NavItem[]
}

/* Grouped by what the learner is doing, not by feature name. */
const menuSections: NavSection[] = [
    {
        key: 'today',
        titleKey: 'nav.today',
        items: [
            { labelKey: 'nav.dashboard', icon: 'home', route: '/' },
            { labelKey: 'nav.dailyJourney', icon: 'compass', route: '/daily-journey' },
            { labelKey: 'nav.dailySession', icon: 'bolt', route: '/session' },
        ],
    },
    {
        key: 'learn',
        titleKey: 'nav.learn',
        items: [
            { labelKey: 'nav.lessons', icon: 'book', route: '/lessons', also: ['/courses'] },
            { labelKey: 'nav.realLife', icon: 'sun', route: '/real-life' },
        ],
    },
    {
        key: 'practice',
        titleKey: 'nav.practice',
        items: [
            { labelKey: 'nav.practicePage', icon: 'pen', route: '/practice' },
            { labelKey: 'nav.cloze', icon: 'blank', route: '/cloze' },
            { labelKey: 'nav.matching', icon: 'link', route: '/matching' },
            { labelKey: 'nav.quiz', icon: 'help', route: '/quiz' },
            { labelKey: 'nav.grammar', icon: 'layers', route: '/grammar' },
            { labelKey: 'nav.reading', icon: 'book', route: '/reading' },
            { labelKey: 'nav.listening', icon: 'headphones', route: '/listening' },
            { labelKey: 'nav.listenRepeat', icon: 'repeat', route: '/listen-repeat' },
            { labelKey: 'nav.listenGuess', icon: 'ear', route: '/listen-guess' },
            { labelKey: 'nav.review', icon: 'refresh', route: '/review' },
            { labelKey: 'nav.hardWords', icon: 'star', route: '/hard-words' },
        ],
    },
    {
        key: 'practice',
        titleKey: 'nav.speakWrite',
        items: [
            { labelKey: 'nav.conversation', icon: 'chat', route: '/conversation' },
            { labelKey: 'nav.coach', icon: 'sparkle', route: '/coach' },
            { labelKey: 'nav.guidedSpeaking', icon: 'mic', route: '/guided-speaking' },
            { labelKey: 'nav.speakingPractice', icon: 'volume', route: '/speaking-practice' },
            { labelKey: 'nav.writing', icon: 'pen', route: '/writing' },
        ],
    },
    {
        key: 'career',
        titleKey: 'nav.career',
        items: [{ labelKey: 'nav.careerEnglish', icon: 'briefcase', route: '/career-english' }],
    },
    {
        key: 'me',
        titleKey: 'nav.me',
        items: [
            { labelKey: 'nav.progress', icon: 'chart', route: '/progress' },
            { labelKey: 'nav.skills', icon: 'target', route: '/skills' },
            { labelKey: 'nav.profile', icon: 'user', route: '/profile' },
            { labelKey: 'nav.aiSettings', icon: 'sliders', route: '/ai-settings' },
        ],
    },
]

const THEME: Record<SectionKey, { active: string; bar: string; dot: string }> = {
    today: { active: 'bg-[#eceff6] text-[#243350]', bar: 'bg-[#243350]', dot: 'bg-[#243350]' },
    learn: { active: 'bg-learn-50 text-learn-700', bar: 'bg-learn-600', dot: 'bg-learn-600' },
    practice: { active: 'bg-practice-50 text-practice-700', bar: 'bg-practice-600', dot: 'bg-practice-600' },
    career: { active: 'bg-amber-50 text-amber-700', bar: 'bg-[#9a5b13]', dot: 'bg-[#9a5b13]' },
    me: { active: 'bg-gray-100 text-gray-800', bar: 'bg-gray-500', dot: 'bg-gray-400' },
}

function matches(path: string, base: string): boolean {
    if (base === '/') return path === '/'

    return path === base || path.startsWith(`${base}/`)
}

function isActive(item: NavItem): boolean {
    return [item.route, ...(item.also ?? [])].some(base => matches(route.path, base))
}

const voiceOpen = ref(false)

function closeMobile() {
    emit('close')
}

/* The drawer is a modal on phones: lock page scroll behind it and close on Escape. */
function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) closeMobile()
}

watch(() => props.open, value => {
    document.body.style.overflow = value ? 'hidden' : ''
})

/*
 * Keep the active destination visible inside the scrolling nav. Adjusts scrollTop
 * directly: scrollIntoView() would also move the browser's keyboard-focus starting
 * point, so the first Tab would no longer reach the skip link.
 */
async function revealActive() {
    await nextTick()

    const nav = document.querySelector<HTMLElement>('aside nav')
    const link = nav?.querySelector<HTMLElement>('a[aria-current="page"]')

    if (!nav || !link) return

    const navBox = nav.getBoundingClientRect()
    const linkBox = link.getBoundingClientRect()

    if (linkBox.top < navBox.top) nav.scrollTop -= navBox.top - linkBox.top + 8
    else if (linkBox.bottom > navBox.bottom) nav.scrollTop += linkBox.bottom - navBox.bottom + 8
}

watch(() => route.path, () => {
    closeMobile()
    void revealActive()
})

watch(() => props.open, value => { if (value) void revealActive() })

onMounted(() => {
    window.addEventListener('keydown', onKey)
    void revealActive()
})
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
})
</script>

<template>
    <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/35 md:hidden"
        aria-hidden="true"
        @click="closeMobile"
    />

    <aside
        class="fixed inset-y-0 z-50 flex h-dvh w-[min(20rem,88vw)] flex-col bg-white shadow-xl transition-transform duration-200 motion-reduce:transition-none md:sticky md:top-0 md:h-screen md:w-[17rem] md:shrink-0 md:translate-x-0 md:shadow-none"
        :class="[
            isPersian
                ? `right-0 border-l border-gray-200/80 ${open ? 'translate-x-0' : 'translate-x-full'}`
                : `left-0 border-r border-gray-200/80 ${open ? 'translate-x-0' : '-translate-x-full'}`,
        ]"
        :aria-label="t('app.mainNavigation')"
    >
        <!-- Brand -->
        <div class="flex items-center justify-between gap-3 px-5 pb-3 pt-[calc(1.25rem+env(safe-area-inset-top))] md:pt-5">
            <RouterLink to="/" class="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#243350]/25" @click="closeMobile">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2c3f66] to-[#0f7a6a] text-white shadow-sm" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17l4-4 3 3 7-8" /><path d="M14 8h5v5" /></svg>
                </span>
                <span class="min-w-0">
                    <span class="font-display block truncate text-lg font-semibold leading-tight text-gray-900">{{ t('app.name') }}</span>
                    <span class="block text-xs text-gray-400">{{ t('app.tagline') }}</span>
                </span>
            </RouterLink>

            <button
                type="button"
                class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#243350]/25 md:hidden"
                :aria-label="t('app.closeMenu')"
                @click="closeMobile"
            >
                <AppIcon name="close" />
            </button>
        </div>

        <!-- Navigation: the only scrolling region, so it always keeps its room -->
        <nav class="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-4 pt-2" :aria-label="t('app.sections')">
            <div v-for="section in menuSections" :key="section.titleKey">
                <p class="mb-1 flex items-center gap-2 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-gray-400">
                    <span class="h-1.5 w-1.5 rounded-full" :class="THEME[section.key].dot" />
                    {{ t(section.titleKey) }}
                </p>

                <ul class="space-y-0.5">
                    <li v-for="item in section.items" :key="item.route">
                        <RouterLink
                            :to="item.route"
                            class="group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#243350]/40"
                            :class="isActive(item) ? THEME[section.key].active : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                            :aria-current="isActive(item) ? 'page' : undefined"
                            @click="closeMobile"
                        >
                            <span v-if="isActive(item)" class="absolute -start-3 top-2 bottom-2 w-1 rounded-e-full" :class="THEME[section.key].bar" aria-hidden="true" />
                            <AppIcon :name="item.icon" :size="19" :class="isActive(item) ? '' : 'text-gray-400 group-hover:text-gray-600'" />
                            <span class="truncate">{{ t(item.labelKey) }}</span>
                        </RouterLink>
                    </li>
                </ul>
            </div>
        </nav>

        <div class="border-t border-gray-200/80 px-3 pt-2">
            <div class="flex items-center gap-3 rounded-xl px-3 py-1 text-sm font-medium text-gray-600">
                <span class="flex-1">{{ t('language.label') }}</span>
                <div class="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" :aria-label="t('language.label')">
                    <button
                        type="button"
                        class="min-h-9 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        :class="locale === 'en' ? 'bg-white text-accent-ink shadow-sm' : 'text-gray-500 hover:text-gray-900'"
                        :aria-pressed="locale === 'en'"
                        :aria-label="t('language.switchTo', { language: t('language.english') })"
                        @click="setLocale('en')"
                    >EN</button>
                    <button
                        type="button"
                        class="min-h-9 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        :class="locale === 'fa' ? 'bg-white text-accent-ink shadow-sm' : 'text-gray-500 hover:text-gray-900'"
                        :aria-pressed="locale === 'fa'"
                        :aria-label="t('language.switchTo', { language: t('language.persian') })"
                        @click="setLocale('fa')"
                    >فا</button>
                </div>
            </div>
        </div>

        <!-- Voice settings: available, but collapsed so they never crowd the navigation -->
        <div class="border-t border-gray-200/80 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
            <button
                type="button"
                class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#243350]/40"
                :aria-expanded="voiceOpen"
                aria-controls="voice-settings"
                @click="voiceOpen = !voiceOpen"
            >
                <AppIcon name="volume" :size="19" class="text-gray-400" />
                <span class="flex-1 text-start">{{ t('voice.settings') }}</span>
                <AppIcon name="chevron-down" :size="16" class="text-gray-400 transition-transform" :class="voiceOpen ? 'rotate-180' : ''" />
            </button>

            <div v-show="voiceOpen" id="voice-settings" class="space-y-3 px-3 pb-2 pt-2">
                <div>
                    <label for="speech-provider" class="mb-1 block text-xs font-medium text-gray-500">{{ t('voice.provider') }}</label>
                    <select id="speech-provider" v-model="speechProvider" class="field !min-h-10 !text-sm">
                        <option value="automatic">{{ t('voice.automatic') }}</option>
                        <option value="neural">{{ t('voice.neural') }}</option>
                        <option value="system">{{ t('voice.system') }}</option>
                    </select>
                </div>
                <div>
                    <label for="speech-voice" class="mb-1 block text-xs font-medium text-gray-500">{{ t('voice.voice') }}</label>
                    <select id="speech-voice" v-model="speechVoice" class="field !min-h-10 !text-sm">
                        <option v-for="voice in speechVoices" :key="voice.id" :value="voice.id">{{ voice.label }}</option>
                    </select>
                </div>
                <div>
                    <label for="speech-rate" class="mb-1 block text-xs font-medium text-gray-500">{{ t('voice.speed') }}</label>
                    <select id="speech-rate" v-model="speechRate" class="field !min-h-10 !text-sm">
                        <option :value="0.6">{{ t('voice.verySlow') }}</option>
                        <option :value="0.75">{{ t('voice.slow') }}</option>
                        <option :value="0.9">{{ t('voice.normal') }}</option>
                        <option :value="1">{{ t('voice.fast') }}</option>
                        <option :value="1.15">{{ t('voice.veryFast') }}</option>
                        <option :value="1.3">{{ t('voice.extraFast') }}</option>
                    </select>
                </div>
            </div>
        </div>
    </aside>
</template>
