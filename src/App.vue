<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppToast from './components/ui/AppToast.vue'

const scrolled = ref(false)

/*
 * Chrome on Android resizes the viewport when the keyboard opens, which
 * changes scrollY and used to pop the (black) back-to-top button up right
 * above the keyboard. The button is simply not shown while any text field
 * has focus — root-cause fix, keyboard and focus styles untouched.
 */
const editingText = ref(false)

const sidebarOpen = ref(false)

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
    window.addEventListener('scroll', handleScroll)
    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)
})

onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('focusin', handleFocusIn)
    window.removeEventListener('focusout', handleFocusOut)
})
</script>

<template>
    <div class="min-h-screen bg-gray-50 text-gray-900">
        <AppToast />

        <!-- Mobile header: a real sticky bar that OWNS layout space, so page
             titles can never scroll underneath a floating button. -->
        <header
            class="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-gray-50/95 px-4 backdrop-blur md:hidden"
            style="padding-top: env(safe-area-inset-top)"
        >
            <button
                type="button"
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm"
                aria-label="Open menu"
                @click="sidebarOpen = true"
            >
                ☰
            </button>
            <span class="truncate font-semibold">English Upgrade</span>
        </header>

        <div class="flex min-h-screen">
            <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

            <main class="min-w-0 flex-1 p-4 md:p-8">
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
                v-if="scrolled && !editingText"
                type="button"
                class="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700"
                aria-label="Back to top"
                @click="goToTop"
            >
                ↑
            </button>
        </Transition>
    </div>
</template>
