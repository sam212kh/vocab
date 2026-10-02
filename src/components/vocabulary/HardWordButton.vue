<script setup lang="ts">
import { computed } from 'vue'
import { useHardWords } from '../../composables/useHardWords'

const props = defineProps<{
    wordId: string
}>()

const {
    isHardWord,
    toggleHardWord,
} = useHardWords()

const hard = computed(() => isHardWord(props.wordId))

function handleToggle() {
    toggleHardWord(props.wordId)
}
</script>

<template>
    <button
        type="button"
        class="shrink-0 rounded-lg px-3 py-2 text-lg transition hover:bg-gray-100"
        :class="
            hard
                ? 'text-yellow-500'
                : 'text-gray-400'
        "
        :aria-label="
            hard
                ? 'Remove from Hard Words'
                : 'Add to Hard Words'
        "
        :title="
            hard
                ? 'Remove from Hard Words'
                : 'Add to Hard Words'
        "
        @click="handleToggle"
    >
        {{ hard ? '⭐' : '☆' }}
    </button>
</template>