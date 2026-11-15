import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  createSelectorState,
  estimateLevel,
  recordAnswer,
  selectNextItem,
  CEFR_LADDER,
  DEFAULT_ITEM_BUDGET,
} from './engine.mjs'
import { sanitizeItem, scoreAnswer } from './scoring.mjs'
import { createSessionStore } from './sessions.mjs'

/**
 * Assessment HTTP module — independent of AI providers. Mounted by
 * server.mjs under /api/assessment/*.
 *
 * Trust model: banks (with canonical answers) and session state live only
 * on the server; every response is built from an allowlist of safe fields.
 * No endpoint ever returns acceptedAnswers / correctIndex / canonical
 * segment order — enforced here and asserted by tests.
 */

const SKILLS = ['vocabulary', 'grammar', 'listening', 'speaking', 'reading', 'writing']

const KINDS = ['placement', 'skill-check']

export function createAssessmentModule({ stateDir, banksDir, rateLimitPerMinute = 60, log = () => {} }) {
  const store = createSessionStore(stateDir)

  const banks = loadBanks(banksDir, log)

  const limits = new Map()

  function withinRateLimit(req) {
    const now = Date.now()
    const ip = req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? 'unknown'
    const entry = limits.get(ip) ?? { count: 0, reset: now + 60000 }

    if (entry.reset <= now) {
      entry.count = 0
      entry.reset = now + 60000
    }

    entry.count++
    limits.set(ip, entry)

    if (limits.size > 5000) {
      for (const [key, value] of limits) if (value.reset < now) limits.delete(key)
    }

    return entry.count <= rateLimitPerMinute
  }

  function progressFor(session) {
    return {
      answered: session.selectorState.records.length,
      budget: session.selectorState.budget,
      done: session.status === 'completed',
    }
  }

  /** Advance to the next item (or complete). Mutates + persists the session. */
  function advance(session) {
    const bank = banks.get(session.skill) ?? []
    const next = selectNextItem(session.selectorState, bank)

    if (!next) {
      completeSession(session)
      return null
    }

    const { item, presentation } = sanitizeItem(next, session.id)

    session.pendingItemId = next.id
    session.pendingPresentation = presentation
    store.update(session)

    return item
  }

  function completeSession(session) {
    session.status = 'completed'
    session.completedAt = Date.now()
    session.pendingItemId = null
    session.pendingPresentation = null
    session.result = estimateLevel(session.selectorState.records)
    store.update(session)

    log('assessment.completed', {
      sessionId: session.id,
      skill: session.skill,
      answered: session.selectorState.records.length,
      level: session.result.level,
      confidence: session.result.confidence,
    })
  }

  function administeredSummaries(session) {
    return session.selectorState.records.map(record => ({
      itemId: record.itemId,
      level: record.level,
      itemType: record.itemType,
      correct: record.correct,
      timeSpentMs: record.timeSpentMs ?? null,
    }))
  }

  /**
   * @returns {boolean} true when the request was handled by this module.
   */
  async function handle(req, res, url, helpers) {
    const { reply, readBody } = helpers

    if (!url.pathname.startsWith('/api/assessment/')) return false

    if (!withinRateLimit(req)) {
      res.setHeader('Retry-After', '60')
      reply(res, 429, { error: 'Rate limit exceeded — try again in a minute' })
      return true
    }

    /* POST /api/assessment/start */
    if (req.method === 'POST' && url.pathname === '/api/assessment/start') {
      const body = await readBody(req, res)
      if (body === null) return true

      if (!SKILLS.includes(body.skill)) {
        reply(res, 400, { error: 'invalid skill' })
        return true
      }

      if (!KINDS.includes(body.kind)) {
        reply(res, 400, { error: 'kind must be placement or skill-check' })
        return true
      }

      const bank = banks.get(body.skill) ?? []

      if (!bank.length) {
        reply(res, 503, { error: `No assessment content is available for ${body.skill} yet` })
        return true
      }

      const selfReported = CEFR_LADDER.includes(body.selfReportedLevel) ? body.selfReportedLevel : null

      const session = store.create({
        skill: body.skill,
        kind: body.kind,
        selectorState: createSelectorState(
          selfReported,
          DEFAULT_ITEM_BUDGET,
          store.recentExposure(body.skill)
        ),
      })

      log('assessment.started', { sessionId: session.id, skill: session.skill, kind: session.kind })

      const item = advance(session)

      reply(res, 200, { sessionId: session.id, item, progress: progressFor(session) })
      return true
    }

    /* Session-scoped routes: /api/assessment/session/<id>/<action> */
    const match = url.pathname.match(/^\/api\/assessment\/session\/([0-9a-f-]{36})\/([a-z]+)$/)

    if (!match) {
      reply(res, 404, { error: 'Not found' })
      return true
    }

    const session = store.get(match[1])
    const action = match[2]

    if (!session) {
      reply(res, 404, { error: 'Unknown assessment session' })
      return true
    }

    if (req.method === 'GET' && action === 'next') {
      if (session.status !== 'active') {
        reply(res, 409, { error: `Session is ${session.status}` })
        return true
      }

      const bank = banks.get(session.skill) ?? []
      const pending = bank.find(item => item.id === session.pendingItemId)

      if (!pending) {
        completeSession(session)
        reply(res, 200, { item: null, progress: progressFor(session) })
        return true
      }

      reply(res, 200, { item: sanitizeItem(pending, session.id).item, progress: progressFor(session) })
      return true
    }

    if (req.method === 'POST' && action === 'answer') {
      const body = await readBody(req, res)
      if (body === null) return true

      if (session.status !== 'active') {
        reply(res, 409, { error: `Session is ${session.status}` })
        return true
      }

      /* Only the server-selected pending item may be answered. */
      if (typeof body.itemId !== 'string' || body.itemId !== session.pendingItemId) {
        reply(res, 400, { error: 'itemId does not match the pending item for this session' })
        return true
      }

      const bank = banks.get(session.skill) ?? []
      const item = bank.find(entry => entry.id === session.pendingItemId)

      if (!item) {
        reply(res, 500, { error: 'Pending item is no longer available' })
        return true
      }

      const { correct } = scoreAnswer(item, body.answer, session.pendingPresentation ?? {})

      session.selectorState = recordAnswer(session.selectorState, item, correct)
      session.selectorState.records[session.selectorState.records.length - 1].timeSpentMs =
        Number.isFinite(body.timeSpentMs) && body.timeSpentMs >= 0 ? Math.floor(body.timeSpentMs) : null

      const nextItem = advance(session)

      reply(res, 200, { correct, item: nextItem, progress: progressFor(session) })
      return true
    }

    if (req.method === 'POST' && action === 'pause') {
      if (session.status !== 'active') {
        reply(res, 409, { error: `Session is ${session.status}` })
        return true
      }

      session.status = 'paused'
      store.update(session)
      reply(res, 200, { status: 'paused', progress: progressFor(session) })
      return true
    }

    if (req.method === 'POST' && action === 'resume') {
      if (session.status !== 'paused') {
        reply(res, 409, { error: `Session is ${session.status}` })
        return true
      }

      session.status = 'active'
      store.update(session)

      const bank = banks.get(session.skill) ?? []
      const pending = bank.find(item => item.id === session.pendingItemId)

      reply(res, 200, {
        status: 'active',
        item: pending ? sanitizeItem(pending, session.id).item : null,
        progress: progressFor(session),
      })
      return true
    }

    if (req.method === 'POST' && action === 'complete') {
      if (session.status === 'completed') {
        reply(res, 409, { error: 'Session is already completed' })
        return true
      }

      completeSession(session)
      reply(res, 200, { status: 'completed', progress: progressFor(session) })
      return true
    }

    if (req.method === 'GET' && action === 'result') {
      if (session.status !== 'completed' || !session.result) {
        reply(res, 409, { error: 'Session is not completed yet' })
        return true
      }

      reply(res, 200, {
        sessionId: session.id,
        skill: session.skill,
        kind: session.kind,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        administered: administeredSummaries(session),
        result: { skill: session.skill, ...session.result },
      })
      return true
    }

    reply(res, 404, { error: 'Not found' })
    return true
  }

  return { handle, banks }
}

function loadBanks(banksDir, log) {
  const banks = new Map()

  let files = []

  try {
    files = readdirSync(banksDir).filter(file => file.endsWith('.json'))
  } catch {
    log('assessment.banks.missing', { banksDir })
    return banks
  }

  for (const file of files) {
    try {
      const bank = JSON.parse(readFileSync(join(banksDir, file), 'utf-8'))

      if (!bank || !SKILLS.includes(bank.skill) || !Array.isArray(bank.items)) {
        log('assessment.bank.invalid', { file })
        continue
      }

      const seen = new Set()
      const items = bank.items.filter(item => {
        if (!item?.id || seen.has(item.id)) return false
        if (!CEFR_LADDER.includes(item.cefrLevel)) return false
        seen.add(item.id)
        return true
      })

      banks.set(bank.skill, items)
      log('assessment.bank.loaded', { skill: bank.skill, items: items.length })
    } catch {
      log('assessment.bank.invalid', { file })
    }
  }

  return banks
}
