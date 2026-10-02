import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import {
    playPersianPronunciation,
    stopPersianPronunciation,
} from '../services/persianPronunciation'
import { speakAsync } from '../services/speech'

export interface ListenRepeatItem {
    word: string
    meaning: string
}

export function useListenRepeat(words: Ref<ListenRepeatItem[]>) {
    const currentIndex = ref(0)
    const isPlaying = ref(false)
    const repeatCount = ref(0)
    const playbackStep = ref<'idle' | 'word' | 'meaning'>('idle')
    const maxRepeats = 3

    const total = computed(() => words.value.length)
    const currentNumber = computed(() => words.value.length ? currentIndex.value + 1 : 0)
    const progressPercent = computed(() => words.value.length ? (currentNumber.value / total.value) * 100 : 0)

    async function playCurrentWord(autoNext = true) {
        if (!words.value.length || !words.value[currentIndex.value]) return

        const currentWord = words.value[currentIndex.value]
        isPlaying.value = true
        repeatCount.value = 0

        try {
            // English x3
            while (repeatCount.value < maxRepeats && isPlaying.value) {
                repeatCount.value++
                playbackStep.value = 'word'

                console.log('[ListenRepeat] English:', currentWord.word, repeatCount.value)
                await speakAsync(currentWord.word, 'en-US')

                if (!isPlaying.value) return
                await delay(500)
            }

            if (!isPlaying.value) return

            // Persian x1
            playbackStep.value = 'meaning'
            console.log('[ListenRepeat] Persian:', currentWord.word, '=>', currentWord.meaning)
            await playPersianPronunciation(currentWord.word)

            if (!isPlaying.value) return
            await delay(1000)

            if (!isPlaying.value) return

            if (autoNext) {
                currentIndex.value = (currentIndex.value + 1) % words.value.length
                await playCurrentWord(true)
                return
            }

            isPlaying.value = false
            playbackStep.value = 'idle'
        } catch (error) {
            console.error('[ListenRepeat] Playback error:', error)
            isPlaying.value = false
            playbackStep.value = 'idle'
        }
    }

    async function start() {
        if (isPlaying.value || !words.value.length) return
        await playCurrentWord(true)
    }

    async function repeatCurrent() {
        if (isPlaying.value || !words.value.length) return
        await playCurrentWord(false)
    }

    function stop() {
        isPlaying.value = false
        playbackStep.value = 'idle'
        repeatCount.value = 0

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel()
        }

        stopPersianPronunciation()
    }

    function next() {
        if (!words.value.length) return
        stop()
        currentIndex.value = (currentIndex.value + 1) % words.value.length
    }

    function previous() {
        if (!words.value.length) return
        stop()
        currentIndex.value = currentIndex.value === 0
            ? words.value.length - 1
            : currentIndex.value - 1
    }

    function reset() {
        stop()
        currentIndex.value = 0
    }

    return {
        currentIndex,
        currentNumber,
        total,
        progressPercent,
        repeatCount,
        playbackStep,
        isPlaying,
        start,
        stop,
        next,
        previous,
        repeatCurrent,
        reset,
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
