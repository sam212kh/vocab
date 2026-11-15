import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Server-authoritative assessment session state, persisted as one JSON
 * file per session (atomic tmp+rename writes) so sessions survive service
 * restarts. Session files contain presentation mappings and answer
 * records but NEVER canonical answers (those stay in the bank files).
 *
 * Single-user deployment: exposure tracking is global, not per-user.
 */

const MAX_RECENT_EXPOSURE_SESSIONS = 5

export function createSessionStore(stateDir) {
  mkdirSync(stateDir, { recursive: true, mode: 0o750 })

  const sessions = new Map()

  /* Load existing session files on boot. */
  for (const file of readdirSync(stateDir)) {
    if (!/^session-[0-9a-f-]+\.json$/.test(file)) continue

    try {
      const session = JSON.parse(readFileSync(join(stateDir, file), 'utf-8'))
      if (session?.id) sessions.set(session.id, session)
    } catch {
      /* Corrupt session files are skipped, never fatal. */
    }
  }

  function persist(session) {
    const path = join(stateDir, `session-${session.id}.json`)
    const tempPath = `${path}.${process.pid}.tmp`

    writeFileSync(tempPath, JSON.stringify(session), { mode: 0o640 })
    renameSync(tempPath, path)
  }

  function create({ skill, kind, selectorState }) {
    const session = {
      id: randomUUID(),
      skill,
      kind,
      status: 'active',
      startedAt: Date.now(),
      completedAt: null,
      selectorState,
      /** itemId → presentation mapping for the currently pending item. */
      pendingItemId: null,
      pendingPresentation: null,
      result: null,
    }

    sessions.set(session.id, session)
    persist(session)

    return session
  }

  function get(id) {
    return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)
      ? sessions.get(id) ?? null
      : null
  }

  function update(session) {
    sessions.set(session.id, session)
    persist(session)
  }

  /** Item ids administered in the most recent completed sessions for a skill. */
  function recentExposure(skill) {
    const recent = [...sessions.values()]
      .filter(session => session.skill === skill && session.status === 'completed')
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_RECENT_EXPOSURE_SESSIONS)

    return [...new Set(recent.flatMap(session => session.selectorState.administeredIds))]
  }

  return { create, get, update, recentExposure }
}
