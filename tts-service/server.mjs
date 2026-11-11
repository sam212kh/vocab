import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const config = {
  host: process.env.TTS_HOST ?? '127.0.0.1',
  port: Number(process.env.TTS_PORT ?? 8787),
  cacheDir: process.env.TTS_CACHE_DIR ?? '/var/cache/english-upgrade-tts',
  maxChars: Number(process.env.TTS_MAX_CHARS ?? 1200),
  cacheTtlMs: Number(process.env.TTS_CACHE_TTL_DAYS ?? 180) * 86400000,
  maxCacheBytes: Number(process.env.TTS_MAX_CACHE_MB ?? 2048) * 1048576,
  timeoutMs: Number(process.env.TTS_TIMEOUT_MS ?? 12000),
  allowedOrigins: (process.env.TTS_ALLOWED_ORIGINS ?? process.env.TTS_ALLOWED_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  azureRegion: process.env.AZURE_SPEECH_REGION ?? '',
  azureKey: process.env.AZURE_SPEECH_KEY ?? '',
  provider: process.env.TTS_PROVIDER ?? 'piper',
  piperBin: process.env.PIPER_BIN ?? 'piper',
  ffmpegBin: process.env.FFMPEG_BIN ?? process.env.PIPER_FFMPEG_BIN ?? 'ffmpeg',
  piperVoices: process.env.TTS_PIPER_VOICES ?? 'en_US-lessac-medium=/opt/piper/voices/en_US-lessac-medium.onnx',
  googleLang: process.env.TTS_GOOGLE_LANG ?? 'en',
}
const piperVoicePaths = new Map(config.piperVoices.split(',').map(item => item.split('=').map(value => value.trim())).filter(([name, path]) => name && path))
const voices = new Set((process.env.TTS_VOICES ?? (config.provider === 'piper' ? [...piperVoicePaths.keys()].join(',') : config.provider === 'google' ? 'en-US' : 'en-US-AriaNeural,en-US-JennyNeural,en-US-GuyNeural')).split(',').map(v => v.trim()).filter(Boolean))
const formats = new Map([['mp3', { mime: 'audio/mpeg', azure: 'audio-24khz-48kbitrate-mono-mp3' }]])
const inFlight = new Map()
const limits = new Map()
const metrics = { hits: 0, misses: 0, generated: 0, errors: 0, generationMs: 0 }
let shuttingDown = false

function log(event, fields = {}) { process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`) }
function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}
function allowedOrigin(req, res) {
  const origin = req.headers.origin
  if (!origin) return true
  const wildcard = config.allowedOrigins.includes('*')
  if (!wildcard && !config.allowedOrigins.includes(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin)
  if (!wildcard) res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match')
  return true
}
function withinRateLimit(req) {
  const now = Date.now()
  const ip = req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? 'unknown'
  const entry = limits.get(ip) ?? { count: 0, reset: now + 60000 }
  if (entry.reset <= now) { entry.count = 0; entry.reset = now + 60000 }
  entry.count++
  limits.set(ip, entry)
  if (limits.size > 5000) for (const [key, value] of limits) if (value.reset < now) limits.delete(key)
  return entry.count <= Number(process.env.TTS_RATE_LIMIT_PER_MINUTE ?? 30)
}
function normalizeText(input) {
  if (typeof input !== 'string') throw new Error('Text must be a string')
  const text = input.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().replace(/\s+/gu, ' ')
  if (!text) throw new Error('Text is required')
  if ([...text].length > config.maxChars) throw new Error(`Text exceeds ${config.maxChars} characters`)
  return text
}
function cacheKey(text, voice, format, rate) {
  return createHash('sha256').update(JSON.stringify({ v: 2, provider: config.provider, text, voice, format, rate })).digest('hex')
}
function ssmlEscape(text) { return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;') }

async function generate(text, voice, format, rate) {
  if (process.env.NODE_ENV === 'test') {
    const delay = Number(process.env.TTS_TEST_GENERATION_DELAY_MS ?? 80)
    if (process.env.TTS_TEST_PROVIDER_FAILURE === '1') throw new Error('Test provider failure')
    if (delay > config.timeoutMs) throw new Error('Test provider timed out')
    await new Promise(resolve => setTimeout(resolve, delay))
    metrics.generated++
    metrics.generationMs += delay
    return Buffer.from(`test-audio:${voice}:${rate}:${text}`)
  }
  if (config.provider === 'piper') return generateWithPiper(text, voice, format, rate)
  if (config.provider === 'google') return generateWithGoogle(text, rate)
  if (!config.azureKey || !config.azureRegion) throw new Error('Azure Neural TTS is not configured')
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const endpoint = `https://${config.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`
    const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}"><prosody rate="${Math.round((rate - 1) * 100)}%">${ssmlEscape(text)}</prosody></voice></speak>`
    const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, headers: { 'Ocp-Apim-Subscription-Key': config.azureKey, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': format.azure, 'User-Agent': 'EnglishUpgradeTTS/1.0' }, body: ssml })
    if (!response.ok) throw new Error(`TTS provider returned ${response.status}`)
    const audio = Buffer.from(await response.arrayBuffer())
    if (!audio.length) throw new Error('TTS provider returned empty audio')
    metrics.generated++
    metrics.generationMs += Date.now() - started
    return audio
  } finally { clearTimeout(timeout) }
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const output = []
    const errors = []
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Piper provider timed out')) }, timeoutMs)
    child.stdout.on('data', chunk => output.push(chunk))
    child.stderr.on('data', chunk => errors.push(chunk))
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(Buffer.concat(output))
      else reject(new Error(Buffer.concat(errors).toString().trim() || `${command} exited with code ${code}`))
    })
    child.stdin.end(input)
  })
}

async function generateWithPiper(text, voice, format, rate) {
  const model = piperVoicePaths.get(voice)
  if (!model) throw new Error(`Piper voice is not configured: ${voice}`)
  const tempDir = await mkdtemp(join(tmpdir(), 'english-upgrade-piper-'))
  const wavPath = join(tempDir, 'speech.wav')
  try {
    await runProcess(config.piperBin, ['--model', model, '--output-file', wavPath, '--length_scale', String(1 / rate)], `${text}\n`, config.timeoutMs)
    const wav = await readFile(wavPath)
    return runProcess(config.ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'mp3', 'pipe:1'], wav, config.timeoutMs)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

// Unofficial endpoint behind Google Translate's "listen" button. No API key, no SLA,
// and Google may rate-limit or block it without notice — acceptable only because this
// is a single self-hosted instance with modest traffic.
function splitForGoogleTranslateTts(text, maxLen = 200) {
  const chunks = []
  let current = ''
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxLen && current) {
      chunks.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}
async function fetchGoogleTranslateTtsChunk(chunk, signal) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${encodeURIComponent(config.googleLang)}&client=tw-ob`
  const response = await fetch(url, {
    signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://translate.google.com/',
    },
  })
  if (!response.ok) throw new Error(`Google TTS returned ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) throw new Error('Google TTS returned empty audio')
  return buffer
}
async function generateWithGoogle(text, rate) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const parts = []
    for (const chunk of splitForGoogleTranslateTts(text)) parts.push(await fetchGoogleTranslateTtsChunk(chunk, controller.signal))
    const mp3 = Buffer.concat(parts)
    if (rate === 1) return mp3
    return runProcess(config.ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-filter:a', `atempo=${rate}`, '-f', 'mp3', 'pipe:1'], mp3, config.timeoutMs)
  } finally {
    clearTimeout(timeout)
  }
}
async function cachedAudio(key, text, voice, format, rate) {
  const path = join(config.cacheDir, `${key}.mp3`)
  try {
    const info = await stat(path)
    if (Date.now() - info.mtimeMs < config.cacheTtlMs) { metrics.hits++; return await readFile(path) }
    await unlink(path)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  metrics.misses++
  if (inFlight.has(key)) return inFlight.get(key)
  const pending = (async () => {
    const bytes = await generate(text, voice, format, rate)
    const tempPath = join(config.cacheDir, `.${key}.${process.pid}.${Date.now()}.tmp`)
    await writeFile(tempPath, bytes, { mode: 0o640, flag: 'wx' })
    await rename(tempPath, path)
    return bytes
  })().catch(error => { metrics.errors++; throw error }).finally(() => inFlight.delete(key))
  inFlight.set(key, pending)
  return pending
}
async function cleanupCache() {
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(config.cacheDir, { withFileTypes: true }).catch(() => [])
  const candidates = []
  for (const file of files) {
    if (!file.isFile() || !/^[a-f0-9]{64}\.mp3$/.test(file.name)) continue
    const path = join(config.cacheDir, file.name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    if (Date.now() - info.mtimeMs > config.cacheTtlMs) await unlink(path).catch(() => {})
    else candidates.push({ path, time: info.mtimeMs, size: info.size })
  }
  let size = candidates.reduce((sum, item) => sum + item.size, 0)
  for (const item of candidates.sort((a, b) => a.time - b.time)) {
    if (size <= config.maxCacheBytes) break
    await unlink(item.path).catch(() => {})
    size -= item.size
  }
}

await mkdir(config.cacheDir, { recursive: true, mode: 0o750 })
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!allowedOrigin(req, res)) return reply(res, 403, { error: 'Origin is not allowed' })
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { status: shuttingDown ? 'shutting-down' : 'ok', provider: config.provider, neuralConfigured: config.provider === 'piper' ? piperVoicePaths.size > 0 : config.provider === 'google' ? true : Boolean(config.azureKey && config.azureRegion) })
  if (req.method === 'GET' && url.pathname === '/api/tts/voices') return reply(res, 200, { voices: [...voices] })
  if (req.method === 'GET' && url.pathname === '/metrics') return reply(res, 200, { ...metrics, cacheHitRatio: metrics.hits + metrics.misses ? metrics.hits / (metrics.hits + metrics.misses) : null, averageGenerationMs: metrics.generated ? metrics.generationMs / metrics.generated : null })
  if (req.method !== 'POST' || url.pathname !== '/api/tts') return reply(res, 404, { error: 'Not found' })
  if (!withinRateLimit(req)) { res.setHeader('Retry-After', '60'); return reply(res, 429, { error: 'Rate limit exceeded' }) }
  let raw = ''
  try {
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 16384) return reply(res, 413, { error: 'Request body is too large' }) }
    const body = JSON.parse(raw)
    const text = normalizeText(body.text)
    const voice = typeof body.voice === 'string' ? body.voice : 'en-US-AriaNeural'
    const formatName = body.format ?? 'mp3'
    const format = formats.get(formatName)
    const rate = Number(body.rate ?? 0.9)
    if (config.provider !== 'google' && !voices.has(voice)) return reply(res, 400, { error: 'Unsupported voice' })
    if (!format) return reply(res, 400, { error: 'Unsupported audio format' })
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.5) return reply(res, 400, { error: 'Rate must be between 0.5 and 1.5' })
    const key = cacheKey(text, voice, formatName, rate)
    const etag = `"${key}"`
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end() }
    const audio = await cachedAudio(key, text, voice, format, rate)
    res.writeHead(200, { 'Content-Type': format.mime, 'Content-Length': audio.length, 'X-Content-Type-Options': 'nosniff' })
    res.end(audio)
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Invalid JSON body' : error.message
    const status = /Invalid JSON|required|string|exceeds|Unsupported|between/.test(message) ? 400 : /abort|timeout|timed out/i.test(message) ? 504 : /not configured/i.test(message) ? 503 : 502
    log('tts.error', { status, message })
    reply(res, status, { error: status === 400 ? message : status === 503 ? message : status === 504 ? 'TTS provider timed out' : 'TTS provider unavailable' })
  }
})
server.headersTimeout = 10000
server.requestTimeout = 15000
server.listen(config.port, config.host, () => log('server.started', { host: config.host, port: config.port, cacheDir: config.cacheDir, provider: config.provider, neuralConfigured: config.provider === 'piper' ? piperVoicePaths.size > 0 : config.provider === 'google' ? true : Boolean(config.azureKey && config.azureRegion) }))
const cleanupTimer = setInterval(() => { void cleanupCache().catch(error => log('cache.cleanup.error', { message: error.message })) }, 6 * 60 * 60 * 1000)
cleanupTimer.unref()
function shutdown() { if (shuttingDown) return; shuttingDown = true; clearInterval(cleanupTimer); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { server, metrics }
