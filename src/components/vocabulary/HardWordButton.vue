<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '../ui/AppIcon.vue'
import { useHardWordsStore } from '../../stores/hardWords'
import type { HardWordSource } from '../../stores/hardWords'
import { useLocale } from '../../services/locale'

const props = defineProps<{
    wordId: string
    meaning: string
    source?: HardWordSource
}>()

const hardWordsStore = useHardWordsStore()
const { t } = useLocale()

const hard = computed(() => hardWordsStore.isHardWord(props.wordId))

function handleToggle() {
    hardWordsStore.toggleWord(
        props.wordId,
        props.meaning,
        props.source,
    )
}
</script>

<template>
    <button
        type="button"
        class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
        :class="hard ? 'text-amber-600' : 'text-gray-400'"
        :aria-label="hard ? t('hardWords.remove') : t('hardWords.saveTo')"
        :aria-pressed="hard"
        :title="hard ? t('hardWords.removeShort') : t('hardWords.addShort')"
        @click.stop="handleToggle"
    >
        <AppIcon :name="hard ? 'star-fill' : 'star'" :size="20" />
        <span class="text-sm font-medium">{{ hard ? t('hardWords.saved') : t('hardWords.save') }}</span>
    </button>
</template>
