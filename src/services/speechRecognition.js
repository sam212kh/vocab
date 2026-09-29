function getSpeechRecognition() {
    const windowWithSpeech = window;
    return (windowWithSpeech.SpeechRecognition ??
        windowWithSpeech.webkitSpeechRecognition ??
        null);
}
export function isSpeechRecognitionSupported() {
    return getSpeechRecognition() !== null;
}
export function recognizeSpeech(lang = 'en-US') {
    return new Promise((resolve, reject) => {
        const SpeechRecognition = getSpeechRecognition();
        if (!SpeechRecognition) {
            reject(new Error('Speech recognition is not supported'));
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
        recognition.onresult = event => {
            const result = event.results[0][0];
            resolve({
                transcript: result.transcript,
                confidence: result.confidence,
            });
        };
        recognition.onerror = event => {
            reject(new Error(`Speech recognition error: ${event.error}`));
        };
        recognition.start();
    });
}
