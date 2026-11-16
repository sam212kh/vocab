<script setup lang="ts">
import AudioPlayer from './AudioPlayer.vue'
import AppIcon from '../ui/AppIcon.vue'
import BottomSheet from '../ui/BottomSheet.vue'

import type { LearnItem } from '../../services/learnItems'

/** Word meaning on demand, on the shared sheet (bottom sheet on phones, card on larger screens). */
defineProps<{
    item: LearnItem | null
    /** Whether "open this expression" makes sense (it is part of the lesson). */
    canOpen: boolean
    saved: boolean
}>()

const emit = defineEmits<{ close: []; open: []; save: [] }>()
</script>

<template>
    <BottomSheet :open="!!item" :title="item?.text ?? ''" @close="emit('close')">
        <template v-if="item">
            <p v-if="item.pos" class="-mt-1 text-xs uppercase tracking-[0.08em] text-ink-faint">{{ item.pos }}</p>
            <p class="fa-text mt-2 text-xl text-ink" lang="fa">{{ item.meaning }}</p>

            <div class="mt-3 flex flex-wrap items-center gap-2">
                <AudioPlayer :text="item.text" size="md" slow :label="item.text" />
            </div>

            <div class="mt-4 flex gap-2">
                <button v-if="canOpen" type="button" class="btn-primary flex-1" @click="emit('open')">Open this expression</button>
                <button
                    type="button"
                    class="btn-secondary"
                    :class="canOpen ? '' : 'flex-1'"
                    :aria-pressed="saved"
                    @click="emit('save')"
                >
                    <AppIcon :name="saved ? 'bookmark-fill' : 'bookmark'" :size="17" />
                    {{ saved ? 'Saved' : 'Save' }}
                </button>
            </div>
        </template>
    </BottomSheet>
</template>
