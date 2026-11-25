import { speakAsync, stop } from './speech'

let unlocked = false

export function getPersianAudioUrl(
    word: string
): string {
    return `/api/tts?lang=fa-IR&text=${encodeURIComponent(word.trim())}`
}

/**
 * Unlock browser audio during a real user interaction.
 *
 * This must be called directly from the Play button
 * before any asynchronous speech starts.
 */
export async function unlockPersianAudio(
    _word: string
): Promise<void> {
    unlocked = true
}

export function isPersianAudioUnlocked(): boolean { return unlocked }

export function stopPersianPronunciation(): void {
    stop()
}

export function playPersianPronunciation(
    word: string
): Promise<void> {
    return speakAsync(word, 'fa-IR').then(ok => {
        if (!ok) throw new Error('Persian Piper audio is unavailable.')
    })
}
