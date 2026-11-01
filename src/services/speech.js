const PREFERENCE_KEY = 'english-upgrade-tts-provider';
const RATE_KEY = 'english-upgrade-tts-rate';
const VOICE_KEY = 'english-upgrade-tts-voice';
const API_BASE_URL = (import.meta.env.VITE_TTS_API_BASE_URL ?? '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api/tts`;
const DEFAULT_VOICE = import.meta.env.VITE_TTS_VOICE ?? 'en_US-lessac-high';
const configuredVoiceIds = (import.meta.env.VITE_TTS_VOICES ?? DEFAULT_VOICE)
    .split(',').map((voice) => voice.trim()).filter(Boolean);
const PRELOAD_COUNT = Math.max(0, Math.min(5, Number(import.meta.env.VITE_TTS_PRELOAD_COUNT ?? 2)));
let voices = [];
let currentAudio = null;
let activeRequest = null;
let preloadRequest = null;
let cancelBrowserSpeech = null;
let audioCache = new Map();
let preference = readPreference();
let lastSpeechError = '';
let speechRate = readRate();
let speechVoice = readVoice();
let speechVoices = configuredVoiceIds.map((id) => ({ id, label: id.replaceAll('_', ' ') }));
function readPreference() {
    if (typeof localStorage === 'undefined')
        return 'automatic';
    try {
        const value = localStorage.getItem(PREFERENCE_KEY);
        return value === 'neural' || value === 'system' ? value : 'automatic';
    }
    catch {
        return 'automatic';
    }
}
function readRate() {
    if (typeof localStorage === 'undefined')
        return 0.9;
    try {
        const value = Number(localStorage.getItem(RATE_KEY));
        return [0.6, 0.75, 0.9, 1, 1.15, 1.3].includes(value)
            ? value
            : 0.9;
    }
    catch {
        return 0.9;
    }
}
function readVoice() {
    if (typeof localStorage === 'undefined')
        return DEFAULT_VOICE;
    try {
        return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE;
    }
    catch {
        return DEFAULT_VOICE;
    }
}
function cacheAudio(key, url) {
    const existing = audioCache.get(key);
    if (existing && existing !== url)
        URL.revokeObjectURL(existing);
    audioCache.set(key, url);
    if (audioCache.size > 80) {
        const oldest = audioCache.keys().next().value;
        if (oldest) {
            URL.revokeObjectURL(audioCache.get(oldest));
            audioCache.delete(oldest);
        }
    }
}
function refreshVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        voices = window.speechSynthesis.getVoices();
    }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}
export function getSpeechProvider() {
    return preference;
}
export function getSpeechError() {
    return lastSpeechError;
}
export function getSpeechRate() {
    return speechRate;
}
export function setSpeechRate(rate) {
    speechRate = rate;
    try {
        localStorage.setItem(RATE_KEY, String(rate));
    }
    catch { /* storage may be disabled */ }
}
export function getSpeechVoice() { return speechVoice; }
export function getSpeechVoices() { return [...speechVoices]; }
export function setSpeechVoice(voice) {
    if (!speechVoices.some(item => item.id === voice))
        return;
    speechVoice = voice;
    try {
        localStorage.setItem(VOICE_KEY, voice);
    }
    catch { /* storage may be disabled */ }
}
export async function loadSpeechVoices() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tts/voices`);
        if (response.ok) {
            const body = await response.json();
            if (Array.isArray(body.voices) && body.voices.length) {
                speechVoices = body.voices.map(id => ({ id, label: id.replaceAll('_', ' ') }));
                if (!speechVoices.some(item => item.id === speechVoice)) {
                    speechVoice = speechVoices[0].id;
                    try {
                        localStorage.setItem(VOICE_KEY, speechVoice);
                    }
                    catch { /* storage may be disabled */ }
                }
            }
        }
    }
    catch { /* static Vite configuration remains available */ }
    return getSpeechVoices();
}
export function setSpeechProvider(provider) {
    if (provider !== preference)
        stopAudio();
    preference = provider;
    try {
        localStorage.setItem(PREFERENCE_KEY, provider);
    }
    catch { /* storage may be disabled */ }
}
export function getAvailableVoices() {
    refreshVoices();
    return [...voices];
}
async function waitForVoices(timeoutMs = 1200) {
    refreshVoices();
    if (voices.length || typeof window === 'undefined' || !('speechSynthesis' in window))
        return voices;
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            window.speechSynthesis.removeEventListener('voiceschanged', finish);
            refreshVoices();
            resolve(voices);
        };
        window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
        window.setTimeout(finish, timeoutMs);
    });
}
export function isLanguageSupported(lang) {
    refreshVoices();
    return voices.some(v => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0])) ||
        (lang.toLowerCase().startsWith('en') && typeof Audio !== 'undefined');
}
function chooseVoice(lang) {
    const candidates = voices.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]));
    return candidates.find(v => /united states|us|american/i.test(v.name) && v.lang.toLowerCase() === 'en-us') ??
        candidates.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ?? candidates[0];
}
async function systemSpeak(text, options = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined')
        return Promise.resolve(false);
    try {
        const lang = options.lang ?? 'en-US';
        const available = await waitForVoices();
        if (!available.length)
            return false;
        cancelBrowserSpeech?.();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = options.rate ?? 0.9;
        utterance.pitch = 1;
        utterance.voice = options.voice ? available.find(v => v.name === options.voice) ?? chooseVoice(lang) : chooseVoice(lang);
        let settled = false;
        return await new Promise(resolve => {
            const finish = (ok) => {
                if (!settled) {
                    settled = true;
                    if (cancelBrowserSpeech === cancelCurrent)
                        cancelBrowserSpeech = null;
                    resolve(ok);
                }
            };
            const cancelCurrent = () => finish(false);
            cancelBrowserSpeech = cancelCurrent;
            utterance.onend = () => finish(true);
            utterance.onerror = () => finish(false);
            options.signal?.addEventListener('abort', () => { window.speechSynthesis.cancel(); finish(false); }, { once: true });
            window.speechSynthesis.speak(utterance);
        });
    }
    catch {
        return false;
    }
}
function stopCurrentAudio() {
    activeRequest?.abort();
    activeRequest = null;
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute('src');
        currentAudio.load();
        currentAudio = null;
    }
    cancelBrowserSpeech?.();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window)
        window.speechSynthesis.cancel();
}
function stopAudio() {
    stopCurrentAudio();
    preloadRequest?.abort();
    preloadRequest = null;
}
async function neuralSpeak(text, options = {}) {
    if (typeof Audio === 'undefined' || !('fetch' in globalThis))
        return false;
    stopCurrentAudio();
    const controller = new AbortController();
    activeRequest = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const cacheKey = `${text}\u0000${options.voice ?? speechVoice}\u0000${options.rate ?? 0.9}`;
    let objectUrl = audioCache.get(cacheKey);
    try {
        if (!objectUrl) {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: options.voice ?? speechVoice, format: 'mp3', rate: options.rate ?? 0.9 }),
                signal: controller.signal,
            });
            if (!response.ok) {
                let detail = `Neural voice service returned HTTP ${response.status}.`;
                try {
                    const body = await response.json();
                    if (body.error)
                        detail = body.error;
                }
                catch { /* response may not be JSON */ }
                lastSpeechError = detail;
                return false;
            }
            objectUrl = URL.createObjectURL(await response.blob());
            cacheAudio(cacheKey, objectUrl);
        }
        const audio = new Audio(objectUrl);
        currentAudio = audio;
        audio.preload = 'auto';
        audio.playbackRate = options.rate ?? 0.9;
        return await new Promise(resolve => {
            let settled = false;
            const finish = (ok) => {
                if (settled)
                    return;
                settled = true;
                audio.onended = null;
                audio.onerror = null;
                if (currentAudio === audio)
                    currentAudio = null;
                resolve(ok);
            };
            audio.onended = () => finish(true);
            audio.onerror = () => {
                lastSpeechError = 'The browser could not play the neural audio file.';
                finish(false);
            };
            controller.signal.addEventListener('abort', () => { audio.pause(); finish(false); }, { once: true });
            audio.play().catch(() => finish(false));
        });
    }
    catch (error) {
        lastSpeechError = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError'
            ? 'Neural voice playback was cancelled.'
            : 'Neural voice service is unreachable. Start the TTS service or check its URL.';
        return false;
    }
    finally {
        options.signal?.removeEventListener('abort', abort);
        if (activeRequest === controller)
            activeRequest = null;
    }
}
const systemVoiceProvider = {
    name: 'system',
    supports: lang => typeof window !== 'undefined' && 'speechSynthesis' in window && lang.length > 0,
    speak: systemSpeak,
};
const neuralVoiceProvider = {
    name: 'neural',
    supports: lang => lang.toLowerCase().startsWith('en') && typeof Audio !== 'undefined',
    speak: neuralSpeak,
};
export async function speakAsync(text, lang = 'en-US', options = {}) {
    const cleanText = text.trim();
    if (!cleanText)
        return false;
    lastSpeechError = '';
    const settings = { rate: speechRate, ...options, lang };
    if (!lang.toLowerCase().startsWith('en'))
        return systemVoiceProvider.speak(cleanText, settings);
    const provider = settings.provider ?? preference;
    if (provider !== 'system') {
        const played = neuralVoiceProvider.supports(lang)
            ? await neuralVoiceProvider.speak(cleanText, settings)
            : false;
        if (played || provider === 'neural')
            return played;
    }
    return systemVoiceProvider.speak(cleanText, settings);
}
export function speak(text, lang = 'en-US') {
    void speakAsync(text, lang);
    return true;
}
export function stop() { stopAudio(); }
export function pause() { currentAudio?.pause(); if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.pause(); }
export function resume() { void currentAudio?.play(); if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.resume(); }
export async function preload(texts, options = {}) {
    if (preference === 'system' || PRELOAD_COUNT === 0 || !texts.length)
        return;
    preloadRequest?.abort();
    const controller = new AbortController();
    preloadRequest = controller;
    await Promise.all(texts.slice(0, PRELOAD_COUNT).map(async (text) => {
        const key = `${text}\u0000${options.voice ?? speechVoice}\u0000${options.rate ?? 0.9}`;
        if (audioCache.has(key))
            return;
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: options.voice ?? speechVoice, format: 'mp3', rate: options.rate ?? 0.9 }), signal: controller.signal });
            if (response.ok)
                cacheAudio(key, URL.createObjectURL(await response.blob()));
        }
        catch { /* preloading must never affect interaction */ }
    }));
    if (preloadRequest === controller)
        preloadRequest = null;
}
export function getSpeechCapabilities() {
    refreshVoices();
    const audio = typeof document !== 'undefined' ? document.createElement('audio') : null;
    return {
        speechSynthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
        voiceCount: voices.length,
        americanEnglishVoice: voices.some(v => v.lang.toLowerCase() === 'en-us'),
        htmlAudio: typeof Audio !== 'undefined',
        mp3: Boolean(audio?.canPlayType('audio/mpeg')),
        neuralEndpoint: `${API_BASE_URL}/health`,
    };
}
export async function diagnoseSpeechCapabilities() {
    const capabilities = getSpeechCapabilities();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
        const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        capabilities.neuralEndpointReachable = response.ok;
    }
    catch {
        capabilities.neuralEndpointReachable = false;
    }
    finally {
        clearTimeout(timeout);
    }
    return capabilities;
}
