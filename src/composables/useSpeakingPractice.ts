import { ref } from 'vue'

import {
    recognizeSpeech,
    isSpeechRecognitionSupported,
} from '../services/speechRecognition'

export function useSpeakingPractice() {
    const isSupported =
        isSpeechRecognitionSupported()

    const isListening = ref(false)

    const transcript = ref('')

    const confidence = ref(0)

    const error = ref('')

    async function startListening() {
        if (!isSupported) {
            error.value =
                'Speech recognition is not supported in this browser.'

            return
        }

        if (isListening.value) {
            return
        }

        isListening.value = true
        transcript.value = ''
        confidence.value = 0
        error.value = ''

        try {
            const result =
                await recognizeSpeech('en-US')

            transcript.value =
                result.transcript

            confidence.value =
                result.confidence
        } catch (err) {
            console.error(err)

            error.value =
                err instanceof Error
                    ? err.message
                    : 'Speech recognition failed.'
        } finally {
            isListening.value = false
        }
    }

    function reset() {
        transcript.value = ''
        confidence.value = 0
        error.value = ''
        isListening.value = false
    }

    return {
        isSupported,
        isListening,
        transcript,
        confidence,
        error,
        startListening,
        reset,
    }
}