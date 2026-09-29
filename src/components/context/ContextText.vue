<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import type { Word } from '../../types/vocabulary'
import SpeechButton from '../ui/SpeechButton.vue'

const props = defineProps<{
    word: Word
}>()

const selected = ref(false)

const contextParts = computed(() => {
    const text = props.word.miniContext
    const target = props.word.word

    if (!text || !target) {
        return [{ text, isTarget: false }]
    }

    const regex = new RegExp(`(${escapeRegex(target)})`, 'gi')

    return text
        .split(regex)
        .filter(Boolean)
        .map(part => ({
            text: part,
            isTarget:
                part.toLowerCase() === target.toLowerCase(),
        }))
})

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function selectWord() {
    selected.value = true

    document.addEventListener(
        'click',
        handleOutsideClick
    )
}

function closePopup() {
    selected.value = false

    document.removeEventListener(
        'click',
        handleOutsideClick
    )
}

function handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement

    if (!target.closest('[data-context-popup]')) {
        closePopup()
    }
}

onBeforeUnmount(() => {
    document.removeEventListener(
        'click',
        handleOutsideClick
    )
})
</script>

<template>
    <div
        data-context-popup
        class="relative"
    >
        <p class="leading-7 text-gray-700">
            <template
                v-for="(part, index) in contextParts"
                :key="index"
            >
                <button
                    v-if="part.isTarget"
                    type="button"
                    class="font-semibold underline decoration-dotted underline-offset-4 hover:bg-gray-100"
                    @click.stop="selectWord"
                >
                    {{ part.text }}
                </button>

                <span v-else>
                    {{ part.text }}
                </span>
            </template>
        </p>

        <div
            v-if="selected"
            class="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border bg-white p-4 shadow-xl"
        >
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h4 class="font-bold">
                        {{ word.word }}
                    </h4>

                    <p class="mt-1 text-sm text-gray-600">
                        {{ word.meaning }}
                    </p>
                </div>

                <button
                    type="button"
                    class="text-gray-400 hover:text-gray-700"
                    @click="closePopup"
                >
                    ✕
                </button>
            </div>

            <div class="mt-3">
                <SpeechButton
                    :text="word.word"
                    lang="en-US"
                    label="🔊 Pronunciation"
                />
            </div>
        </div>
    </div>
    <SpeechButton
        :text="props.word.miniContext"
        lang="en-US"
        label="🔊"
    />
</template>