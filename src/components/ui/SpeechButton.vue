<script setup lang="ts">
import { ref } from 'vue'

import {
    speak,
    isLanguageSupported,
} from '../../services/speech'

import AppToast from './AppToast.vue'

const props = withDefaults(
    defineProps<{
        text: string
        lang?: 'en-US' | 'fa-IR'
        label?: string
    }>(),
    {
        lang: 'en-US',
        label: '🔊',
    }
)

const toast = ref('')

function play() {
    if (!isLanguageSupported(props.lang)) {
        toast.value =
            props.lang === 'fa-IR'
                ? 'Persian voice is not available'
                : 'English voice is not available'

        setTimeout(() => {
            toast.value = ''
        }, 3000)

        return
    }

    speak(props.text, props.lang)
}
</script>

<template>
    <button
        type="button"
        class="rounded-lg px-2 py-1 text-sm hover:bg-gray-100"
        @click="play"
    >
        {{ label }}
    </button>

    <Teleport to="body">
        <AppToast :message="toast" />
    </Teleport>
</template>