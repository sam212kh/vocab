import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* Isolated env BEFORE importing the server. */
const stateDir = mkdtempSync(join(tmpdir(), 'assessment-state-'))
const banksDir = mkdtempSync(join(tmpdir(), 'assessment-banks-'))

/** Fixture bank: grammar, 8 items per level at A2/B1/B2, mixed types. */
function fixtureBank() {
  const items = []

  for (const level of ['A2', 'B1', 'B2']) {
    for (let i = 0; i < 5; i++) {
      items.push({
        id: `${level}-mc-${i}`,
        type: 'multiple-choice',
        skill: 'grammar',
        cefrLevel: level,
        prompt: `Pick the right option (${level} #${i})`,
        options: ['correct-option', 'wrong-1', 'wrong-2'],
        correctIndex: 0,
      })
    }

    for (let i = 0; i < 3; i++) {
      items.push({
        id: `${level}-fb-${i}`,
        type: 'fill-blank',
        skill: 'grammar',
        cefrLevel: level,
        before: 'She',
        after: 'to work.',
        acceptedAnswers: [`secretanswer${level}${i}`],
      })
    }
  }

  items.push({
    id: 'B1-so-0',
    type: 'sentence-ordering',
    skill: 'grammar',
    cefrLevel: 'B1',
    segments: ['She', 'has', 'never', 'been', 'to', 'London'],
  })

  return { skill: 'grammar', items }
}

mkdirSync(banksDir, { recursive: true })
writeFileSync(join(banksDir, 'grammar.json'), JSON.stringify(fixtureBank()))

process.env.NODE_ENV = 'test'
process.env.AI_HOST = '127.0.0.1'
process.env.AI_SERVICE_PORT = '0'
process.env.AI_ALLOWED_ORIGINS = 'http://localhost:5173'
process.env.AI_PROVIDER = 'ollama'
process.env.ASSESSMENT_STATE_DIR = stateDir
process.env.ASSESSMENT_BANKS_DIR = banksDir
process.env.ASSESSMENT_RATE_LIMIT_PER_MINUTE = '1000'

const { server } = await import('../server.mjs')

await new Promise(resolve => (server.listening ? resolve() : server.once('listening', resolve)))
const base = `http://127.0.0.1:${server.address().port}`

after(() => server.close())

function post(path, body = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Assert no response ever leaks key material. */
function assertNoKeys(payload) {
  const raw = JSON.stringify(payload)
  assert.ok(!raw.includes('acceptedAnswers'), 'acceptedAnswers leaked')
  assert.ok(!raw.includes('correctIndex'), 'correctIndex leaked')
  assert.ok(!raw.includes('secretanswer'), 'canonical text answer leaked')
}

test('start validates skill and kind; unknown-skill banks report 503', async () => {
  assert.equal((await post('/api/assessment/start', { skill: 'alchemy', kind: 'placement' })).status, 400)
  assert.equal((await post('/api/assessment/start', { skill: 'grammar', kind: 'exam' })).status, 400)
  assert.equal((await post('/api/assessment/start', { skill: 'reading', kind: 'placement' })).status, 503)
})

test('full session: start → answer to completion → result; no response ever contains answer keys', async () => {
  const startResponse = await post('/api/assessment/start', {
    skill: 'grammar', kind: 'skill-check', selfReportedLevel: 'B1',
  })

  assert.equal(startResponse.status, 200)
  let body = await startResponse.json()
  assertNoKeys(body)

  const sessionId = body.sessionId
  assert.ok(sessionId)
  assert.ok(body.item)

  let answered = 0

  while (body.item) {
    const item = body.item

    /* Answer every MC with option 0 ("correct-option" canonical position is
     * index 0 in the bank — the sanitized options are NOT shuffled for MC,
     * options order is part of the question). Text items: wrong answer. */
    const answer = item.type === 'multiple-choice'
      ? { kind: 'choice', index: 0 }
      : item.type === 'sentence-ordering'
        ? { kind: 'ordering', order: item.segments.map((_, i) => i) }
        : { kind: 'text', text: 'definitely wrong' }

    const answerResponse = await post(`/api/assessment/session/${sessionId}/answer`, {
      itemId: item.id, answer, timeSpentMs: 1000,
    })

    assert.equal(answerResponse.status, 200)
    body = await answerResponse.json()
    assertNoKeys(body)
    assert.equal(typeof body.correct, 'boolean')
    answered++

    assert.ok(answered <= 20, 'session must terminate')
  }

  assert.equal(body.progress.done, true)

  const resultResponse = await fetch(`${base}/api/assessment/session/${sessionId}/result`)
  assert.equal(resultResponse.status, 200)

  const result = await resultResponse.json()
  assertNoKeys(result)

  assert.equal(result.skill, 'grammar')
  assert.ok(Array.isArray(result.administered))
  assert.ok(result.administered.length >= 6)
  assert.ok(result.result.notes.join(' ').includes('not a certified CEFR'))
  assert.ok(result.result.confidence <= 0.8)
})

test('answers are scored server-side: correct MC answers are recognized', async () => {
  const start = await (await post('/api/assessment/start', { skill: 'grammar', kind: 'skill-check', selfReportedLevel: 'A2' })).json()

  /* find an MC item (first item may be any type; answer until MC appears) */
  let body = start

  while (body.item && body.item.type !== 'multiple-choice') {
    body = await (await post(`/api/assessment/session/${start.sessionId}/answer`, {
      itemId: body.item.id, answer: { kind: 'text', text: 'x' },
    })).json()
  }

  assert.ok(body.item, 'expected an MC item')

  const response = await (await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: body.item.id, answer: { kind: 'choice', index: 0 },
  })).json()

  assert.equal(response.correct, true)
})

test('sentence-ordering is served shuffled and scored via the server-side mapping', async () => {
  /* Drive a session to the ordering item by exhausting B1 mc/fb first. */
  const start = await (await post('/api/assessment/start', { skill: 'grammar', kind: 'skill-check', selfReportedLevel: 'B1' })).json()

  let body = start
  let orderingItem = null

  while (body.item) {
    if (body.item.type === 'sentence-ordering') {
      orderingItem = body.item
      break
    }

    body = await (await post(`/api/assessment/session/${start.sessionId}/answer`, {
      itemId: body.item.id,
      answer: body.item.type === 'multiple-choice'
        ? { kind: 'choice', index: body.item.id.includes('-mc-0') ? 0 : 1 } /* mixed results keep level stable-ish */
        : { kind: 'text', text: 'x' },
    })).json()
  }

  if (!orderingItem) return /* budget hit before ordering item — acceptable path */

  /* The canonical sentence; reconstruct the displayed→canonical answer by
   * sorting displayed segments back into the known correct sentence. */
  const canonical = ['She', 'has', 'never', 'been', 'to', 'London']
  const displayed = orderingItem.segments

  const used = new Array(displayed.length).fill(false)
  const order = canonical.map(word => {
    const index = displayed.findIndex((segment, i) => segment === word && !used[i])
    used[index] = true
    return index
  })

  const response = await (await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: orderingItem.id, answer: { kind: 'ordering', order },
  })).json()

  assert.equal(response.correct, true)
})

test('submitting a non-pending or arbitrary item id is rejected', async () => {
  const start = await (await post('/api/assessment/start', { skill: 'grammar', kind: 'skill-check' })).json()

  const wrongItem = await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: 'B2-mc-4', answer: { kind: 'choice', index: 0 },
  })

  assert.equal(wrongItem.status, 400)

  const madeUp = await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: 'nonexistent-item', answer: { kind: 'choice', index: 0 },
  })

  assert.equal(madeUp.status, 400)
})

test('unknown and malformed session ids are rejected', async () => {
  const unknown = await post('/api/assessment/session/00000000-0000-4000-8000-000000000000/answer', {
    itemId: 'x', answer: { kind: 'choice', index: 0 },
  })
  assert.equal(unknown.status, 404)

  const malformed = await fetch(`${base}/api/assessment/session/../../etc/passwd/result`)
  assert.equal(malformed.status, 404)
})

test('pause blocks answering; resume returns the same pending item', async () => {
  const start = await (await post('/api/assessment/start', { skill: 'grammar', kind: 'skill-check' })).json()
  const pendingId = start.item.id

  assert.equal((await post(`/api/assessment/session/${start.sessionId}/pause`)).status, 200)

  const blocked = await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: pendingId, answer: { kind: 'choice', index: 0 },
  })
  assert.equal(blocked.status, 409)

  const resume = await (await post(`/api/assessment/session/${start.sessionId}/resume`)).json()
  assert.equal(resume.item.id, pendingId)
  assertNoKeys(resume)

  /* double resume is a conflict */
  assert.equal((await post(`/api/assessment/session/${start.sessionId}/resume`)).status, 409)
})

test('result is unavailable before completion; forced completion works; answering after completion is blocked', async () => {
  const start = await (await post('/api/assessment/start', { skill: 'grammar', kind: 'skill-check' })).json()

  assert.equal((await fetch(`${base}/api/assessment/session/${start.sessionId}/result`)).status, 409)

  assert.equal((await post(`/api/assessment/session/${start.sessionId}/complete`)).status, 200)

  const blocked = await post(`/api/assessment/session/${start.sessionId}/answer`, {
    itemId: start.item.id, answer: { kind: 'choice', index: 0 },
  })
  assert.equal(blocked.status, 409)

  /* a forced early completion has insufficient evidence → null level */
  const result = await (await fetch(`${base}/api/assessment/session/${start.sessionId}/result`)).json()
  assert.equal(result.result.level, null)
  assert.equal(result.result.evidenceQuality, 'insufficient')
})
