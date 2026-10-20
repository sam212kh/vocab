import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import {
    playPersianPronunciation,
    stopPersianPronunciation,
} from '../services/persianPronunciation'
import {
    getSpeechRate,
    preload,
    speakAsync,
    stop as stopSpeech,
} from '../services/speech'

export interface ListenRepeatItem {
    word: string
    meaning: string
}

export function useListenRepeat(
    words: Ref<ListenRepeatItem[]>
) {
    const currentIndex = ref(0)
    const isPlaying = ref(false)
    const repeatCount = ref(0)

    const playbackStep = ref<
        'idle' | 'word' | 'meaning'
    >('idle')

    const maxRepeats = 3

    const total = computed(() => {
        return words.value.length
    })

    const currentNumber = computed(() => {
        if (!words.value.length) {
            return 0
        }

        return currentIndex.value + 1
    })

    const progressPercent = computed(() => {
        if (!words.value.length) {
            return 0
        }

        return (
            (currentNumber.value / total.value) * 100
        )
    })

    async function playCurrentWord(
        autoNext = true
    ) {

        if (!words.value.length) {
            return
        }

        const currentWord =
            words.value[currentIndex.value]

        if (!currentWord) {
            return
        }

        const upcoming = Array.from(
            { length: Math.min(2, Math.max(0, words.value.length - 1)) },
            (_, offset) => words.value[(currentIndex.value + offset + 1) % words.value.length]?.word ?? ''
        ).filter(Boolean)
        void preload(upcoming, { rate: getSpeechRate() })

        isPlaying.value = true
        repeatCount.value = 0
        playbackStep.value = 'word'

        // English × 3
        while (
            repeatCount.value < maxRepeats &&
            isPlaying.value
            ) {
            repeatCount.value++

            playbackStep.value = 'word'

            await speakAsync(
                currentWord.word,
                'en-US',
                { rate: getSpeechRate() }
            )

            if (!isPlaying.value) {
                return
            }

            await delay(800)
        }

        if (!isPlaying.value) {
            return
        }

        // Persian meaning × 1
        playbackStep.value = 'meaning'

        await playPersianPronunciation(currentWord.word)



        // await speakAsync(
        //     currentWord.meaning,
        //     'fa-IR'
        // )

        if (!isPlaying.value) {
            return
        }

        await delay(1000)

        if (!isPlaying.value) {
            return
        }

        if (!autoNext) isPlaying.value = false
        playbackStep.value = 'idle'
    }

    async function start() {
        if (
            isPlaying.value ||
            !words.value.length
        ) {
            return
        }

        isPlaying.value = true
        while (isPlaying.value && words.value.length) {
            await playCurrentWord(true)
            if (isPlaying.value) {
                currentIndex.value =
                    (currentIndex.value + 1) % words.value.length
                repeatCount.value = 0
            }
        }
    }

    async function repeatCurrent() {
        if (
            isPlaying.value ||
            !words.value.length
        ) {
            return
        }

        await playCurrentWord(false)
    }

    function stop() {
        isPlaying.value = false
        playbackStep.value = 'idle'

        stopSpeech()
        stopPersianPronunciation()
    }

    // Manual Next
    function next() {

        if (!words.value.length) {
            return
        }

        stop()

        currentIndex.value =
            (currentIndex.value + 1) %
            words.value.length

        repeatCount.value = 0
    }

    // Manual Previous
    function previous() {
        if (!words.value.length) {
            return
        }

        stop()

        currentIndex.value =
            currentIndex.value === 0
                ? words.value.length - 1
                : currentIndex.value - 1

        repeatCount.value = 0
    }

    function reset() {
        stop()

        currentIndex.value = 0
        repeatCount.value = 0
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
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
