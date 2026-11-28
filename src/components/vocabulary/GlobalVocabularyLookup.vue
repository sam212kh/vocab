<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

import WordMeaningsBlock from '../learn/WordMeaningsBlock.vue'
import HardWordButton from './HardWordButton.vue'
import { loadManifest } from '../../services/vocabulary'
import { resolveFullHardWords } from '../../services/hardWordsLookup'
import { useLocale } from '../../services/locale'

import type { Word } from '../../types/vocabulary'

const { t } = useLocale()

const open = ref(false)
const loading = ref(false)
const selected = ref('')
const word = ref<Word | null>(null)
const context = ref('')
const position = ref({ top: 0, left: 0 })
let lookupSequence = 0

const cachedLookups = new Map<string, Word | null>()

function cleanSelection(value: string): string {
    return value
        .normalize('NFC')
        .trim()
        .replace(/^[\s"“”‘’.,!?;:()[\]{}]+|[\s"“”‘’.,!?;:()[\]{}]+$/gu, '')
        .replace(/\s+/gu, ' ')
}

function selectionFromEditable(target: Node | null): boolean {
    const element = target instanceof Element ? target : target?.parentElement

    return !!element?.closest('button, a, input, textarea, select, summary, [role="button"], [contenteditable="true"]')
}

function textBeforeRange(root: Node, range: Range): string {
    const prefix = document.createRange()
    prefix.selectNodeContents(root)
    prefix.setEnd(range.startContainer, range.startOffset)
    return prefix.toString()
}

function sourceContext(range: Range): string {
    const parent = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
    const root = parent?.closest('p, li, article, [data-lookup-context]') ?? parent
    const fullText = (root?.textContent ?? selected.value).replace(/\s+/gu, ' ').trim()
    const before = root ? textBeforeRange(root, range).replace(/\s+/gu, ' ') : ''
    const selectedText = cleanSelection(window.getSelection()?.toString() ?? selected.value)
    const selectedIndex = Math.max(0, fullText.toLowerCase().indexOf(selectedText.toLowerCase(), before.length - selectedText.length))
    const sentenceStart = Math.max(0, ...[...fullText.slice(0, selectedIndex).matchAll(/[.!?。！？](?:\s+|$)/gu)].map(match => (match.index ?? 0) + match[0].length))
    const endMatch = /[.!?。！？](?:\s+|$)/gu.exec(fullText.slice(selectedIndex + selectedText.length))
    const sentenceEnd = endMatch ? selectedIndex + selectedText.length + endMatch.index + endMatch[0].length : fullText.length

    return fullText.slice(sentenceStart, sentenceEnd).trim().slice(0, 500)
}

async function inspectSelection(target?: EventTarget | null) {
    const browserSelection = window.getSelection()

    if (!browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) return

    const range = browserSelection.getRangeAt(0)
    if (selectionFromEditable(range.commonAncestorContainer) || selectionFromEditable(target as Node | null)) return

    const text = cleanSelection(browserSelection.toString())
    if (!text || text.length > 80 || !/[A-Za-z]/u.test(text)) return

    const sequence = ++lookupSequence
    selected.value = text
    context.value = sourceContext(range)
    word.value = null
    open.value = true
    loading.value = true

    const rect = range.getBoundingClientRect()
    const viewport = window.visualViewport
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    const popupWidth = Math.min(352, viewportWidth - 16)
    const preferredTop = rect.bottom + 8
    const top = preferredTop + 280 <= viewportHeight ? preferredTop : Math.max(8, rect.top - 288)
    position.value = {
        top,
        left: Math.min(Math.max(rect.left, 8), viewportWidth - popupWidth - 8),
    }

    const key = text.toLowerCase()
    if (cachedLookups.has(key)) {
        word.value = cachedLookups.get(key) ?? null
        loading.value = false
        return
    }

    try {
        const manifest = await loadManifest()
        const result = await resolveFullHardWords([text], manifest)
        if (sequence !== lookupSequence) return

        const found = result.found[0] ?? null
        cachedLookups.set(key, found)
        word.value = found
    } catch {
        if (sequence === lookupSequence) word.value = null
    } finally {
        if (sequence === lookupSequence) loading.value = false
    }
}

function close() {
    open.value = false
    word.value = null
    selected.value = ''
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open.value) close()
}

function handleViewportChange() {
    if (open.value) close()
}

function handlePointerDown(event: PointerEvent) {
    if (open.value && !(event.target instanceof Element && event.target.closest('[data-global-lookup]'))) close()
}

const handleMouseup = (event: MouseEvent) => void nextTick(() => inspectSelection(event.target))
const handleTouchend = (event: TouchEvent) => void nextTick(() => inspectSelection(event.target))

onMounted(() => {
    document.addEventListener('mouseup', handleMouseup)
    document.addEventListener('touchend', handleTouchend, { passive: true })
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, { passive: true })
})

onUnmounted(() => {
    document.removeEventListener('mouseup', handleMouseup)
    document.removeEventListener('touchend', handleTouchend)
    document.removeEventListener('pointerdown', handlePointerDown)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange)
})
</script>

<template>
    <div
        v-if="open"
        data-global-lookup
        class="fixed z-[70] max-h-[calc(100dvh-1rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl"
        :style="{ top: `${position.top}px`, left: `${position.left}px` }"
        role="dialog"
        :aria-label="t('vocabulary.lookup')"
        @mouseup.stop
        @touchend.stop
        @pointerdown.stop
    >
        <div class="flex items-start justify-between gap-3">
            <p class="wrap-anywhere text-xs text-gray-500" dir="ltr" lang="en">{{ selected }}</p>
            <button type="button" class="min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-100" :aria-label="t('app.closeMenu')" @click="close">×</button>
        </div>

        <p v-if="loading" class="mt-3 text-sm text-gray-500">{{ t('vocabulary.lookupLoading') }}</p>
        <template v-else-if="word">
            <div class="mt-3">
                <WordMeaningsBlock
                    :word="word.word"
                    :meaning="word.meaning"
                    :pos="word.pos"
                    :synonyms="word.synonyms"
                    :examples="word.examples"
                    :collocations="word.collocations"
                    :related-expressions="word.relatedExpressions"
                    :usage="word.usage"
                    :source="{ context, module: 'global-lookup', courseId: word.courseId, lessonId: word.lessonId }"
                />
            </div>
            <p v-if="context" class="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500" dir="ltr" lang="en">
                {{ context }}
            </p>
        </template>
        <template v-else>
            <p class="mt-3 text-sm text-gray-600">{{ t('vocabulary.lookupNotFound') }}</p>
            <div class="mt-2">
                <HardWordButton
                    :word-id="selected"
                    meaning=""
                    :source="{ context, module: 'global-lookup' }"
                />
            </div>
        </template>
    </div>
</template>
