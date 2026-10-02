const AUDIO_BASE_PATH = '/audio/fa'

let currentAudio: HTMLAudioElement | null = null
let unlocked = false

function normalizeWord(word: string): string {
    return word
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
}

export function getPersianAudioUrl(word: string): string {
    const filename = normalizeWord(word)
    return `${AUDIO_BASE_PATH}/${encodeURIComponent(filename)}.mp3`
}

function getAudioElement(): HTMLAudioElement {
    if (!currentAudio) {
        currentAudio = new Audio()
        currentAudio.preload = 'auto'
        currentAudio.volume = 1
    }

    return currentAudio
}

/**
 * Unlock the SAME audio element that will later be used for playback.
 * The previous implementation unlocked one Audio instance and then
 * created a different instance for playback, which can still be blocked
 * by browser media autoplay policy after speechSynthesis awaits.
 */
export async function unlockPersianAudio(word: string): Promise<void> {
    const audio = getAudioElement()
    const url = getPersianAudioUrl(word)

    audio.pause()
    audio.currentTime = 0
    audio.src = url
    audio.load()
    audio.muted = true

    try {
        await audio.play()
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        unlocked = true
        console.log('[PersianAudio] Audio unlocked:', url)
    } catch (error) {
        audio.muted = false
        console.error('[PersianAudio] Failed to unlock audio:', error)
        throw error
    }
}

export function stopPersianPronunciation(): void {
    if (!currentAudio) return

    currentAudio.pause()
    currentAudio.currentTime = 0
}

export function playPersianPronunciation(word: string): Promise<void> {
    const audio = getAudioElement()
    const url = getPersianAudioUrl(word)

    audio.pause()
    audio.currentTime = 0
    audio.src = url
    audio.preload = 'auto'
    audio.muted = false
    audio.volume = 1

    console.log('[PersianAudio] Playing:', url, 'unlocked:', unlocked)

    return new Promise((resolve, reject) => {
        let settled = false

        const cleanup = () => {
            audio.onended = null
            audio.onerror = null
        }

        const finish = () => {
            if (settled) return
            settled = true
            cleanup()
            resolve()
        }

        audio.onended = finish
        audio.onerror = () => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error(`Persian audio not found or failed: ${url}`))
        }

        audio.play()
            .then(() => {
                console.log('[PersianAudio] play() success:', url)
            })
            .catch(error => {
                if (settled) return
                settled = true
                cleanup()
                console.error('[PersianAudio] play() failed:', error)
                reject(error)
            })
    })
}
