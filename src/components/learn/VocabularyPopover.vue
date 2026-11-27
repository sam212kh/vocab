<script setup lang="ts">
import AudioPlayer from './AudioPlayer.vue'
import AppIcon from '../ui/AppIcon.vue'
import BottomSheet from '../ui/BottomSheet.vue'
import WordMeaningsBlock from './WordMeaningsBlock.vue'

import type { LearnItem } from '../../services/learnItems'
import { useLocale } from '../../services/locale'

/** Word meaning on demand, on the shared sheet (bottom sheet on phones, card on larger screens). */
defineProps<{
    item: LearnItem | null
    /** Whether "open this expression" makes sense (it is part of the lesson). */
    canOpen: boolean
    saved: boolean
}>()

const emit = defineEmits<{ close: []; open: []; save: [] }>()
const { t } = useLocale()
</script>

<template>
    <BottomSheet :open="!!item" :title="item?.text ?? ''" @close="emit('close')">
        <template v-if="item">
            <div class="mt-2">
                <WordMeaningsBlock
                    :word="item.text"
                    :meaning="item.meaning"
                    :pos="item.pos"
                    :synonyms="item.synonyms"
                    :examples="item.examples"
                    :show-audio="false"
                />
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
                <AudioPlayer :text="item.text" size="md" slow :label="item.text" />
            </div>

            <div class="mt-4 flex gap-2">
                <button v-if="canOpen" type="button" class="btn-primary flex-1" @click="emit('open')">{{ t('vocabulary.openExpression') }}</button>
                <button
                    type="button"
                    class="btn-secondary"
                    :class="canOpen ? '' : 'flex-1'"
                    :aria-pressed="saved"
                    @click="emit('save')"
                >
                    <AppIcon :name="saved ? 'bookmark-fill' : 'bookmark'" :size="17" />
                    {{ saved ? t('hardWords.saved') : t('hardWords.save') }}
                </button>
            </div>
        </template>
    </BottomSheet>
</template>
