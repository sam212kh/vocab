export type SpeechProvider = 'automatic' | 'neural' | 'system'
export type SpeechRate = 0.6 | 0.75 | 0.9 | 1 | 1.15 | 1.3

export interface SpeechOptions {
    lang?: string
    voice?: string
    rate?: number
    provider?: SpeechProvider
    signal?: AbortSignal
}

export interface SpeechEngine {
    readonly name: SpeechProvider
    supports(lang: string): boolean
    speak(text: string, options?: SpeechOptions): Promise<boolean>
}

export interface SpeechVoice {
    id: string
    label: string
}

export interface SpeechCapabilities {
    speechSynthesis: boolean
    voiceCount: number
    americanEnglishVoice: boolean
    htmlAudio: boolean
    mp3: boolean
    neuralEndpoint: string
    neuralEndpointReachable?: boolean
}

const PREFERENCE_KEY = 'english-upgrade-tts-provider'
const RATE_KEY = 'english-upgrade-tts-rate'
const VOICE_KEY = 'english-upgrade-tts-voice'
const API_BASE_URL = (import.meta.env.VITE_TTS_API_BASE_URL ?? '').replace(/\/$/, '')
const API_URL = `${API_BASE_URL}/api/tts`
const DEFAULT_VOICE = import.meta.env.VITE_TTS_VOICE ?? 'en_US-lessac-high'
const configuredVoiceIds = (import.meta.env.VITE_TTS_VOICES ?? DEFAULT_VOICE)
    .split(',').map((voice: string) => voice.trim()).filter(Boolean)
const PRELOAD_COUNT = Math.max(0, Math.min(5, Number(import.meta.env.VITE_TTS_PRELOAD_COUNT ?? 2)))
let voices: SpeechSynthesisVoice[] = []
let currentAudio: HTMLAudioElement | null = null
let activeRequest: AbortController | null = null
let preloadRequest: AbortController | null = null
let cancelBrowserSpeech: (() => void) | null = null
let audioCache = new Map<string, string>()
let preference: SpeechProvider = readPreference()
let lastSpeechError = ''
let speechRate: SpeechRate = readRate()
let speechVoice = readVoice()
let speechVoices: SpeechVoice[] = configuredVoiceIds.map((id: string) => ({ id, label: id.replaceAll('_', ' ') }))

function readPreference(): SpeechProvider {
    if (typeof localStorage === 'undefined') return 'automatic'
    try {
        const value = localStorage.getItem(PREFERENCE_KEY)
        return value === 'neural' || value === 'system' ? value : 'automatic'
    } catch {
        return 'automatic'
    }
}

function readRate(): SpeechRate {
    if (typeof localStorage === 'undefined') return 0.9
    try {
        const value = Number(localStorage.getItem(RATE_KEY))
        return [0.6, 0.75, 0.9, 1, 1.15, 1.3].includes(value)
            ? value as SpeechRate
            : 0.9
    } catch {
        return 0.9
    }
}

function readVoice(): string {
    if (typeof localStorage === 'undefined') return DEFAULT_VOICE
    try { return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE } catch { return DEFAULT_VOICE }
}

function cacheAudio(key: string, url: string): void {
    const existing = audioCache.get(key)
    if (existing && existing !== url) URL.revokeObjectURL(existing)
    audioCache.set(key, url)
    if (audioCache.size > 80) {
        const oldest = audioCache.keys().next().value
        if (oldest) {
            URL.revokeObjectURL(audioCache.get(oldest)!)
            audioCache.delete(oldest)
        }
    }
}

function refreshVoices(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        voices = window.speechSynthesis.getVoices()
    }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

export function getSpeechProvider(): SpeechProvider {
    return preference
}

export function getSpeechError(): string {
    return lastSpeechError
}

export function getSpeechRate(): SpeechRate {
    return speechRate
}

export function setSpeechRate(rate: SpeechRate): void {
    speechRate = rate
    try { localStorage.setItem(RATE_KEY, String(rate)) } catch { /* storage may be disabled */ }
}

export function getSpeechVoice(): string { return speechVoice }

export function getSpeechVoices(): SpeechVoice[] { return [...speechVoices] }

export function setSpeechVoice(voice: string): void {
    if (!speechVoices.some(item => item.id === voice)) return
    speechVoice = voice
    try { localStorage.setItem(VOICE_KEY, voice) } catch { /* storage may be disabled */ }
}

export async function loadSpeechVoices(): Promise<SpeechVoice[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tts/voices`)
        if (response.ok) {
            const body = await response.json() as { voices?: string[] }
            if (Array.isArray(body.voices) && body.voices.length) {
                speechVoices = body.voices.map(id => ({ id, label: id.replaceAll('_', ' ') }))
                if (!speechVoices.some(item => item.id === speechVoice)) {
                    speechVoice = speechVoices[0].id
                    try { localStorage.setItem(VOICE_KEY, speechVoice) } catch { /* storage may be disabled */ }
                }
            }
        }
    } catch { /* static Vite configuration remains available */ }
    return getSpeechVoices()
}

export function setSpeechProvider(provider: SpeechProvider): void {
    if (provider !== preference) stopAudio()
    preference = provider
    try { localStorage.setItem(PREFERENCE_KEY, provider) } catch { /* storage may be disabled */ }
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
    refreshVoices()
    return [...voices]
}

async function waitForVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
    refreshVoices()
    if (voices.length || typeof window === 'undefined' || !('speechSynthesis' in window)) return voices
    return new Promise(resolve => {
        let done = false
        const finish = () => {
            if (done) return
            done = true
            window.speechSynthesis.removeEventListener('voiceschanged', finish)
            refreshVoices()
            resolve(voices)
        }
        window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
        window.setTimeout(finish, timeoutMs)
    })
}

export function isLanguageSupported(lang: string): boolean {
    refreshVoices()
    return voices.some(v => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0])) ||
        (lang.toLowerCase().startsWith('en') && typeof Audio !== 'undefined')
}

function chooseVoice(lang: string): SpeechSynthesisVoice | undefined {
    const candidates = voices.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0]))
    return candidates.find(v => /united states|us|american/i.test(v.name) && v.lang.toLowerCase() === 'en-us') ??
        candidates.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ?? candidates[0]
}

async function systemSpeak(text: string, options: SpeechOptions = {}): Promise<boolean> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve(false)
    try {
        const lang = options.lang ?? 'en-US'
        const available = await waitForVoices()
        if (!available.length) return false
        cancelBrowserSpeech?.()
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = lang
        utterance.rate = options.rate ?? 0.9
        utterance.pitch = 1
        utterance.voice = options.voice ? available.find(v => v.name === options.voice) ?? chooseVoice(lang)! : chooseVoice(lang)!
        let settled = false
        return await new Promise<boolean>(resolve => {
        const finish = (ok: boolean) => {
            if (!settled) {
                settled = true
                if (cancelBrowserSpeech === cancelCurrent) cancelBrowserSpeech = null
                resolve(ok)
            }
        }
        const cancelCurrent = () => finish(false)
        cancelBrowserSpeech = cancelCurrent
        utterance.onend = () => finish(true)
        utterance.onerror = () => finish(false)
        options.signal?.addEventListener('abort', () => { window.speechSynthesis.cancel(); finish(false) }, { once: true })
        window.speechSynthesis.speak(utterance)
        })
    } catch {
        return false
    }
}

function stopCurrentAudio(): void {
    activeRequest?.abort()
    activeRequest = null
    if (currentAudio) {
        currentAudio.pause()
        currentAudio.removeAttribute('src')
        currentAudio.load()
        currentAudio = null
    }
    cancelBrowserSpeech?.()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

function stopAudio(): void {
    stopCurrentAudio()
    preloadRequest?.abort()
    preloadRequest = null
}

async function neuralSpeak(text: string, options: SpeechOptions = {}): Promise<boolean> {
    if (typeof Audio === 'undefined' || !('fetch' in globalThis)) return false
    stopCurrentAudio()
    const controller = new AbortController()
    activeRequest = controller
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const cacheKey = `${text}\u0000${options.voice ?? speechVoice}\u0000${options.rate ?? 0.9}`
    let objectUrl = audioCache.get(cacheKey)
    try {
        if (!objectUrl) {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice: options.voice ?? speechVoice, format: 'mp3', rate: options.rate ?? 0.9 }),
                signal: controller.signal,
            })
            if (!response.ok) {
                let detail = `Neural voice service returned HTTP ${response.status}.`
                try {
                    const body = await response.json() as { error?: string }
                    if (body.error) detail = body.error
                } catch { /* response may not be JSON */ }
                lastSpeechError = detail
                return false
            }
            objectUrl = URL.createObjectURL(await response.blob())
            cacheAudio(cacheKey, objectUrl)
        }
        const audio = new Audio(objectUrl)
        currentAudio = audio
        audio.preload = 'auto'
        audio.playbackRate = options.rate ?? 0.9
        return await new Promise<boolean>(resolve => {
            let settled = false
            const finish = (ok: boolean) => {
                if (settled) return
                settled = true
                audio.onended = null
                audio.onerror = null
                if (currentAudio === audio) currentAudio = null
                resolve(ok)
            }
            audio.onended = () => finish(true)
            audio.onerror = () => {
                lastSpeechError = 'The browser could not play the neural audio file.'
                finish(false)
            }
            controller.signal.addEventListener('abort', () => { audio.pause(); finish(false) }, { once: true })
            audio.play().catch(() => finish(false))
        })
    } catch (error) {
        lastSpeechError = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError'
            ? 'Neural voice playback was cancelled.'
            : 'Neural voice service is unreachable. Start the TTS service or check its URL.'
        return false
    } finally {
        options.signal?.removeEventListener('abort', abort)
        if (activeRequest === controller) activeRequest = null
    }
}

const systemVoiceProvider: SpeechEngine = {
    name: 'system',
    supports: lang => typeof window !== 'undefined' && 'speechSynthesis' in window && lang.length > 0,
    speak: systemSpeak,
}

const neuralVoiceProvider: SpeechEngine = {
    name: 'neural',
    supports: lang => lang.toLowerCase().startsWith('en') && typeof Audio !== 'undefined',
    speak: neuralSpeak,
}

export async function speakAsync(text: string, lang = 'en-US', options: Omit<SpeechOptions, 'lang'> = {}): Promise<boolean> {
    const cleanText = text.trim()
    if (!cleanText) return false
    lastSpeechError = ''
    const settings = { rate: speechRate, ...options, lang }
    if (!lang.toLowerCase().startsWith('en')) return systemVoiceProvider.speak(cleanText, settings)
    const provider = settings.provider ?? preference
    if (provider !== 'system') {
        const played = neuralVoiceProvider.supports(lang)
            ? await neuralVoiceProvider.speak(cleanText, settings)
            : false
        if (played || provider === 'neural') return played
    }
    return systemVoiceProvider.speak(cleanText, settings)
}

export function speak(text: string, lang = 'en-US'): boolean {
    void speakAsync(text, lang)
    return true
}

export function stop(): void { stopAudio() }
export function pause(): void { currentAudio?.pause(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.pause() }
export function resume(): void { void currentAudio?.play(); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.resume() }

export async function preload(texts: string[], options: Omit<SpeechOptions, 'signal'> = {}): Promise<void> {
    if (preference === 'system' || PRELOAD_COUNT === 0 || !texts.length) return
    preloadRequest?.abort()
    const controller = new AbortController()
    preloadRequest = controller
    await Promise.all(texts.slice(0, PRELOAD_COUNT).map(async text => {
        const key = `${text}\u0000${options.voice ?? speechVoice}\u0000${options.rate ?? 0.9}`
        if (audioCache.has(key)) return
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: options.voice ?? speechVoice, format: 'mp3', rate: options.rate ?? 0.9 }), signal: controller.signal })
            if (response.ok) cacheAudio(key, URL.createObjectURL(await response.blob()))
        } catch { /* preloading must never affect interaction */ }
    }))
    if (preloadRequest === controller) preloadRequest = null
}

export function getSpeechCapabilities(): SpeechCapabilities {
    refreshVoices()
    const audio = typeof document !== 'undefined' ? document.createElement('audio') : null
    return {
        speechSynthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
        voiceCount: voices.length,
        americanEnglishVoice: voices.some(v => v.lang.toLowerCase() === 'en-us'),
        htmlAudio: typeof Audio !== 'undefined',
        mp3: Boolean(audio?.canPlayType('audio/mpeg')),
        neuralEndpoint: `${API_BASE_URL}/health`,
    }
}

export async function diagnoseSpeechCapabilities(): Promise<SpeechCapabilities> {
    const capabilities = getSpeechCapabilities()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2500)
    try {
        const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal })
        capabilities.neuralEndpointReachable = response.ok
    } catch {
        capabilities.neuralEndpointReachable = false
    } finally {
        clearTimeout(timeout)
    }
    return capabilities
}
