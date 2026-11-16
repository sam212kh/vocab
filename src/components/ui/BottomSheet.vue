<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppIcon from './AppIcon.vue'

/**
 * The one dialog pattern: a bottom sheet on phones, a centred card on larger
 * screens. Fixed-position (never overflows a narrow viewport), Esc and
 * backdrop close it, focus moves to the close button on open.
 */
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const closeButton = ref<HTMLButtonElement | null>(null)

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

watch(() => props.open, async value => {
    if (!value) return
    await nextTick()
    closeButton.value?.focus()
})
</script>

<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition duration-150 motion-reduce:transition-none"
            leave-active-class="transition duration-100 motion-reduce:transition-none"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
        >
            <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" :aria-label="title">
                <button type="button" class="absolute inset-0 bg-black/35" aria-label="Close" tabindex="-1" @click="emit('close')" />
                <div
                    class="relative flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl sm:rounded-3xl"
                    :class="wide ? 'max-w-2xl' : 'max-w-md'"
                >
                    <div class="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
                        <p class="font-display text-lg font-semibold text-gray-900">{{ title }}</p>
                        <button
                            ref="closeButton"
                            type="button"
                            class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
                            aria-label="Close"
                            @click="emit('close')"
                        >
                            <AppIcon name="close" />
                        </button>
                    </div>
                    <div class="overflow-y-auto px-5 pb-5"><slot /></div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>
