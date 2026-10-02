const AUDIO_BASE_PATH = '/audio/fa'

let currentAudio: HTMLAudioElement | null = null
let unlocked = false

function normalizeWord(word: string): string {
    return word
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
}

export function getPersianAudioUrl(
    word: string
): string {
    const filename = normalizeWord(word)

    return `${AUDIO_BASE_PATH}/${encodeURIComponent(filename)}.mp3`
}

/**
 * Unlock browser audio during a real user interaction.
 *
 * This must be called directly from the Play button
 * before any asynchronous speech starts.
 */
export async function unlockPersianAudio(
    word: string
): Promise<void> {
    if (unlocked) {
        return
    }

    const audio = new Audio(
        getPersianAudioUrl(word)
    )

    audio.preload = 'auto'
    audio.muted = true

    try {
        await audio.play()

        audio.pause()
        audio.currentTime = 0
        audio.muted = false

        unlocked = true

        console.log(
            '[PersianAudio] Audio unlocked'
        )
    } catch (error) {
        console.error(
            '[PersianAudio] Failed to unlock audio:',
            error
        )

        throw error
    }
}

export function stopPersianPronunciation(): void {
    if (!currentAudio) {
        return
    }

    currentAudio.pause()
    currentAudio.currentTime = 0

    currentAudio = null
}

export function playPersianPronunciation(
    word: string
): Promise<void> {
    stopPersianPronunciation()


    return new Promise((resolve, reject) => {
        const url = getPersianAudioUrl(word)


        const audio = new Audio(url)

        currentAudio = audio

        audio.preload = 'auto'

        audio.onended = () => {
            if (currentAudio === audio) {
                currentAudio = null
            }

            resolve()
        }

        audio.onerror = () => {
            if (currentAudio === audio) {
                currentAudio = null
            }

            reject(
                new Error(
                    `Persian audio not found: ${url}`
                )
            )
        }

        audio.play().catch(error => {
            if (currentAudio === audio) {
                currentAudio = null
            }


            reject(error)
        })
    })
}