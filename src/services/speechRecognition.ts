export interface SpeechRecognitionResult {
    transcript: string
    confidence: number
}

interface SpeechRecognitionEventLike extends Event {
    results: {
        [index: number]: {
            [index: number]: {
                transcript: string
                confidence: number
            }
        }
    }
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string
}

interface SpeechRecognitionInstance {
    lang: string
    interimResults: boolean
    maxAlternatives: number
    continuous: boolean

    start(): void
    stop(): void
    abort(): void

    onresult:
        | ((event: SpeechRecognitionEventLike) => void)
        | null

    onerror:
        | ((event: SpeechRecognitionErrorEvent) => void)
        | null

    onend:
        | (() => void)
        | null
}

interface SpeechRecognitionConstructor {
    new (): SpeechRecognitionInstance
}

function getSpeechRecognition():
    SpeechRecognitionConstructor | null {
    const windowWithSpeech =
        window as typeof window & {
            SpeechRecognition?: SpeechRecognitionConstructor
            webkitSpeechRecognition?: SpeechRecognitionConstructor
        }

    return (
        windowWithSpeech.SpeechRecognition ??
        windowWithSpeech.webkitSpeechRecognition ??
        null
    )
}

export function isSpeechRecognitionSupported(): boolean {
    return getSpeechRecognition() !== null
}

export function recognizeSpeech(
    lang = 'en-US'
): Promise<SpeechRecognitionResult> {
    return new Promise((resolve, reject) => {
        const SpeechRecognition =
            getSpeechRecognition()

        if (!SpeechRecognition) {
            reject(
                new Error(
                    'Speech recognition is not supported'
                )
            )

            return
        }

        const recognition =
            new SpeechRecognition()

        recognition.lang = lang
        recognition.interimResults = false
        recognition.maxAlternatives = 1
        recognition.continuous = false

        recognition.onresult = event => {
            const result =
                event.results[0][0]

            resolve({
                transcript: result.transcript,
                confidence: result.confidence,
            })
        }

        recognition.onerror = event => {
            reject(
                new Error(
                    `Speech recognition error: ${event.error}`
                )
            )
        }

        recognition.start()
    })
}