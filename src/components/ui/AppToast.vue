<script setup lang="ts">
defineProps<{
    message: string
}>()
</script>

<template>
    <div
        v-if="message"
        class="fixed right-5 top-5 z-50 rounded-lg bg-black px-4 py-3 text-sm text-white shadow-lg"
    >
        {{ message }}
    </div>
</template>