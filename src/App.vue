<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import AppSidebar from './components/layout/AppSidebar.vue'

const visible = ref(false)

function handleScroll() {
    visible.value = window.scrollY > 300
}

function goToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
    <div class="min-h-screen bg-gray-50 text-gray-900">
        <div class="flex min-h-screen">
            <AppSidebar />

            <main class="min-w-0 flex-1 p-4 pt-16 md:p-8">
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
                v-if="visible"
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
