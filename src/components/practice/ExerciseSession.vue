<script setup lang="ts">
import ExercisePlayer from '../exercise/ExercisePlayer.vue'
import ActivityBar from './ActivityBar.vue'

import type { Exercise, ExerciseResult } from '../../types/exercise'

/** One exercise at a time inside the shared practice frame. Logic stays in ExercisePlayer. */
defineProps<{
    exercise: Exercise
    index: number
    total: number
    answered: boolean
    title?: string
}>()

const emit = defineEmits<{ result: [result: ExerciseResult]; next: [] }>()
</script>

<template>
    <div>
        <p v-if="title" class="label mb-2 truncate">{{ title }}</p>
        <ActivityBar :current="index" :total="total" class="mb-4" />

        <article class="surface p-5 sm:p-7">
            <ExercisePlayer :key="exercise.id" :exercise="exercise" @result="result => emit('result', result)" />

            <button v-if="answered" type="button" class="btn-primary btn-lg mt-6 w-full" @click="emit('next')">
                {{ index >= total - 1 ? 'See results' : 'Continue' }}
            </button>
        </article>

        <div v-if="$slots.footer" class="mt-3"><slot name="footer" /></div>
    </div>
</template>
