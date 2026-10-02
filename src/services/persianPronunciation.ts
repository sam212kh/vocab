const AUDIO_BASE_PATH = '/audio/fa'

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

export function playPersianPronunciation(
    word: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        const audio = new Audio(
            getPersianAudioUrl(word)
        )

        audio.preload = 'auto'

        audio.onended = () => {
            resolve()
        }

        audio.onerror = () => {
            reject(
                new Error(
                    `Persian pronunciation audio not found for "${word}"`
                )
            )
        }

        audio.play().catch(reject)
    })
}