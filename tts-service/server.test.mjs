import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'

let baseUrl
let cacheDir
let service

before(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'tts-cache-'))
  Object.assign(process.env, {
    NODE_ENV: 'test',
    TTS_PROVIDER: 'azure',
    TTS_HOST: '127.0.0.1',
    TTS_PORT: '0',
    TTS_CACHE_DIR: cacheDir,
    TTS_ALLOWED_ORIGIN: 'http://app.test',
    TTS_MAX_CHARS: '30',
    TTS_RATE_LIMIT_PER_MINUTE: '100',
    TTS_TEST_GENERATION_DELAY_MS: '100',
  })
  service = await import('./server.mjs')
  await new Promise((resolve, reject) => {
    if (service.server.listening) return resolve()
    service.server.once('listening', resolve)
    service.server.once('error', reject)
  })
  const address = service.server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  if (service?.server.listening) await new Promise(resolve => service.server.close(resolve))
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
})

async function synthesize(body) {
  return fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://app.test' },
    body: JSON.stringify(body),
  })
}

test('valid audio includes media and cache headers; repeated request hits cache', async () => {
  const first = await synthesize({ text: 'test word', voice: 'en-US-AriaNeural', format: 'mp3' })
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('content-type'), 'audio/mpeg')
  assert.match(first.headers.get('etag'), /^"[a-f0-9]{64}"$/)
  assert.match(first.headers.get('cache-control'), /immutable/)
  const bytes = Buffer.from(await first.arrayBuffer())
  const second = await synthesize({ text: 'test word', voice: 'en-US-AriaNeural', format: 'mp3' })
  assert.deepEqual(Buffer.from(await second.arrayBuffer()), bytes)
  const metrics = await (await fetch(`${baseUrl}/metrics`)).json()
  assert.equal(metrics.generated, 1)
  assert.ok(metrics.hits >= 1)
})

test('concurrent duplicate misses share one generation; voices have separate cache entries', async () => {
  const text = `parallel ${Date.now()}`
  const pair = await Promise.all([
    synthesize({ text, voice: 'en-US-AriaNeural' }),
    synthesize({ text, voice: 'en-US-AriaNeural' }),
  ])
  assert.deepEqual(pair.map(response => response.status), [200, 200])
  const beforeVoice = (await (await fetch(`${baseUrl}/metrics`)).json()).generated
  const otherVoice = await synthesize({ text, voice: 'en-US-JennyNeural' })
  assert.equal(otherVoice.status, 200)
  const afterVoice = (await (await fetch(`${baseUrl}/metrics`)).json()).generated
  assert.equal(afterVoice, beforeVoice + 1)
})

test('rejects invalid text, voices, format, and disallowed origins', async () => {
  assert.equal((await synthesize({ text: '   ' })).status, 400)
  assert.equal((await synthesize({ text: 'x'.repeat(31) })).status, 400)
  assert.equal((await synthesize({ text: 'hello', voice: '../other' })).status, 400)
  assert.equal((await synthesize({ text: 'hello', format: 'wav' })).status, 400)
  const denied = await fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://unexpected.test' },
    body: JSON.stringify({ text: 'hello' }),
  })
  assert.equal(denied.status, 403)
})

test('ETag conditional request returns not modified', async () => {
  const body = { text: `etag ${Date.now()}`, voice: 'en-US-AriaNeural' }
  const first = await synthesize(body)
  const etag = first.headers.get('etag')
  await first.arrayBuffer()
  const second = await fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://app.test', 'If-None-Match': etag },
    body: JSON.stringify(body),
  })
  assert.equal(second.status, 304)
})

test('provider failures and timeouts return useful gateway errors without caching audio', async () => {
  process.env.TTS_TEST_PROVIDER_FAILURE = '1'
  const failure = await synthesize({ text: `failure ${Date.now()}`, voice: 'en-US-AriaNeural' })
  assert.equal(failure.status, 502)
  assert.equal((await failure.json()).error, 'TTS provider unavailable')
  delete process.env.TTS_TEST_PROVIDER_FAILURE

  process.env.TTS_TEST_GENERATION_DELAY_MS = '13000'
  const timeout = await synthesize({ text: `timeout ${Date.now()}`, voice: 'en-US-AriaNeural' })
  assert.equal(timeout.status, 504)
  assert.equal((await timeout.json()).error, 'TTS provider timed out')
  process.env.TTS_TEST_GENERATION_DELAY_MS = '100'
})
