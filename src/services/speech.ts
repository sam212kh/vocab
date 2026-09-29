let voices: SpeechSynthesisVoice[] = []

function loadVoices(): void {
    if (!('speechSynthesis' in window)) return
    voices = window.speechSynthesis.getVoices()
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    loadVoices()
    window.speechSynthesis.addEventListener(
        'voiceschanged',
        loadVoices
    )
}

export function isLanguageSupported(lang: string): boolean {
    loadVoices()

    const language = lang
        .toLowerCase()
        .split('-')[0]

    return voices.some(voice =>
        voice.lang
            .toLowerCase()
            .startsWith(language)
    )
}

function createUtterance(
    text: string,
    lang: string
): SpeechSynthesisUtterance {
    const utterance =
        new SpeechSynthesisUtterance(text)

    utterance.lang = lang
    utterance.rate =
        lang === 'fa-IR' ? 0.9 : 0.8
    utterance.pitch = 1

    const exactVoice =
        voices.find(
            voice =>
                voice.lang.toLowerCase() ===
                lang.toLowerCase()
        )

    if (exactVoice) {
        utterance.voice = exactVoice
    }

    return utterance
}

export function speak(
    text: string,
    lang = 'en-US'
): boolean {
    if (!('speechSynthesis' in window)) {
        return false
    }

    if (!isLanguageSupported(lang)) {
        console.warn(`No voice found for ${lang}`)
        return false
    }

    window.speechSynthesis.cancel()

    window.speechSynthesis.speak(
        createUtterance(text, lang)
    )

    return true
}

export function speakAsync(
    text: string,
    lang = 'en-US'
): Promise<boolean> {
    return new Promise(resolve => {
        if (!('speechSynthesis' in window)) {
            resolve(false)
            return
        }

        if (!isLanguageSupported(lang)) {
            resolve(false)
            return
        }

        window.speechSynthesis.cancel()

        const utterance =
            createUtterance(text, lang)

        utterance.onend = () => resolve(true)
        utterance.onerror = () => resolve(false)

        window.speechSynthesis.speak(utterance)
    })
}
