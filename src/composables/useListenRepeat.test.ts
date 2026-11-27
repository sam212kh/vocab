import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useListenRepeat, type ListenRepeatItem } from './useListenRepeat'

const speakAsyncMock = vi.fn().mockResolvedValue(true)

vi.mock('../services/speech', () => ({
    getSpeechRate: () => 1,
    preload: vi.fn().mockResolvedValue(undefined),
    speakAsync: (...args: unknown[]) => speakAsyncMock(...args),
    stop: vi.fn(),
}))

vi.mock('../services/persianPronunciation', () => ({
    playPersianPronunciation: (text: string) => speakAsyncMock(text, 'fa-IR'),
    stopPersianPronunciation: vi.fn(),
    unlockPersianAudio: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
    speakAsyncMock.mockClear()
    vi.useRealTimers()
})

describe('useListenRepeat Persian meaning playback', () => {
    it('speaks every verified Persian meaning, never the English word, to the fa-IR voice', async () => {
        vi.useFakeTimers()

        const words = ref<ListenRepeatItem[]>([
            {
                word: 'adequate',
                meaning: 'کافی؛ مناسب',
                synonyms: [
                    { word: 'sufficient', meaning: 'کافی' },
                    { word: 'acceptable', meaning: 'قابل قبول' },
                ],
            },
        ])

        const { repeatCurrent } = useListenRepeat(words)

        const pending = repeatCurrent()
        await vi.runAllTimersAsync()
        await pending

        const faCalls = speakAsyncMock.mock.calls.filter(call => call[1] === 'fa-IR')

        expect(faCalls.map(call => call[0])).toEqual(['کافی', 'مناسب', 'قابل قبول'])
        expect(faCalls.some(call => call[0] === 'adequate')).toBe(false)
    })

    it('falls back to the bare meaning when there are no synonym glosses', async () => {
        vi.useFakeTimers()

        const words = ref<ListenRepeatItem[]>([
            { word: 'obtain', meaning: 'به دست آوردن' },
        ])

        const { repeatCurrent } = useListenRepeat(words)

        const pending = repeatCurrent()
        await vi.runAllTimersAsync()
        await pending

        const faCalls = speakAsyncMock.mock.calls.filter(call => call[1] === 'fa-IR')

        expect(faCalls.map(call => call[0])).toEqual(['به دست آوردن'])
    })
})
