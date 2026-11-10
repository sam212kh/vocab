<script setup lang="ts">
import { useToastStore } from '../../stores/toast'

const toastStore = useToastStore()

const kindClass: Record<string, string> = {
    info: 'bg-black text-white',
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
}
</script>

<template>
    <div class="fixed right-5 top-5 z-50 flex flex-col gap-2">
        <TransitionGroup
            enter-active-class="transition duration-200"
            leave-active-class="transition duration-200"
            enter-from-class="opacity-0 translate-x-2"
            leave-to-class="opacity-0 translate-x-2"
        >
            <button
                v-for="toast in toastStore.toasts"
                :key="toast.id"
                type="button"
                class="rounded-lg px-4 py-3 text-left text-sm shadow-lg"
                :class="kindClass[toast.kind]"
                @click="toastStore.dismiss(toast.id)"
            >
                {{ toast.message }}
            </button>
        </TransitionGroup>
    </div>
</template>
