<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { modeForPath } from './router/modes'
import { useEvidenceRecorder } from './composables/useEvidenceRecorder'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppToast from './components/ui/AppToast.vue'
import AppIcon from './components/ui/AppIcon.vue'
import { installLocaleDomBridge, useLocale } from './services/locale'

const route = useRoute()
const router = useRouter()
const { t, isPersian } = useLocale()
const mode = computed(() => modeForPath(route.path))

const scrolled = ref(false)
const mainEl = ref<HTMLElement | null>(null)

/*
 * Chrome on Android resizes the viewport when the keyboard opens, which
 * changes scrollY and used to pop the (black) back-to-top button up right
 * above the keyboard. The button is simply not shown while any text field
 * has focus — root-cause fix, keyboard and focus styles untouched.
 */
const editingText = ref(false)

const sidebarOpen = ref(false)
let localeDomBridge: ReturnType<typeof installLocaleDomBridge> | null = null

/* In-app navigation to a different page moves focus to the content. Not on the first load
 * (the skip link must stay first in tab order) and not on query-only changes. */
const stopFocusHook = router.afterEach((to, from) => {
    if (from.matched.length === 0 || to.path === from.path) return

    void nextTick(() => mainEl.value?.focus({ preventScroll: true }))
})

function handleScroll() {
    scrolled.value = window.scrollY > 300
}

function isTextField(target: EventTarget | null): boolean {
    return target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

function handleFocusIn(event: FocusEvent) {
    if (isTextField(event.target)) editingText.value = true
}

function handleFocusOut(event: FocusEvent) {
    if (isTextField(event.target)) editingText.value = false
}

function goToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
    useEvidenceRecorder().ensureBackfill()
    localeDomBridge = installLocaleDomBridge(document.body)
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)
})

onUnmounted(() => {
    localeDomBridge?.stop()
    stopFocusHook()
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('focusin', handleFocusIn)
    window.removeEventListener('focusout', handleFocusOut)
})
</script>

<template>
    <div class="min-h-screen bg-surface text-gray-900" :data-mode="mode" :dir="isPersian ? 'rtl' : 'ltr'">
        <a href="#main" class="sr-only z-50 rounded-xl bg-white px-4 py-2 font-semibold text-gray-900 shadow-md focus:not-sr-only focus:fixed focus:start-3 focus:top-3" @click.prevent="mainEl?.focus()">{{ t('app.skipToContent') }}</a>
        <AppToast />

        <!-- Mobile header: a real sticky bar that OWNS layout space, so page
             titles can never scroll underneath a floating button. -->
        <header
            class="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200/80 bg-surface/95 px-4 backdrop-blur md:hidden"
            style="padding-top: env(safe-area-inset-top)"
        >
            <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                :aria-label="t('app.openMenu')"
                @click="sidebarOpen = true"
            >
                <AppIcon name="menu" />
            </button>
            <span class="font-display truncate text-lg font-semibold">{{ t('app.name') }}</span>
        </header>

        <div class="flex min-h-screen">
            <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

            <main id="main" ref="mainEl" tabindex="-1" class="min-w-0 flex-1 p-4 pb-10 outline-none md:p-8 md:pb-12">
                <RouterView />
            </main>
        </div>

        <Transition
            enter-active-class="transition duration-200"
            leave-active-class="transition duration-200"
            enter-from-class="opacity-0 translate-y-2"
            leave-to-class="opacity-0 translate-y-2"
        >
            <button
                v-if="scrolled && !editingText && !route.meta.focusLayout"
                type="button"
                class="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700"
                :aria-label="t('app.backToTop')"
                @click="goToTop"
            >
                ↑
            </button>
        </Transition>
    </div>
</template>
