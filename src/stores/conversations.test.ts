import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useConversationsStore } from './conversations'

import type { ConversationSummary } from '../types/conversation'

beforeEach(() => {
    setActivePinia(createPinia())
})

function startDefault(store = useConversationsStore()) {
    return store.startSession({
        mode: 'free',
        difficulty: 'B1',
        feedbackMode: 'gentle',
    })
}

function learnerMessage(text: string) {
    return {
        role: 'learner' as const,
        text,
        inputMethod: 'text' as const,
        voiceConfidence: null,
        corrections: [],
        translation: null,
    }
}

const SUMMARY: ConversationSummary = {
    overall: 'Good session.',
    strengths: ['Clear questions'],
    improvements: ['Present perfect'],
    corrections: [],
    usefulExpressions: [],
    suggestedNextActivity: 'Practice present perfect.',
    provider: 'ollama',
    model: 'test',
    promptVersion: 'conversation-summary-v1',
    generatedAt: Date.now(),
}

describe('conversations store', () => {
    it('starts a session and tracks it as active', () => {
        const store = useConversationsStore()
        const session = startDefault(store)

        expect(store.activeSession?.id).toBe(session.id)
        expect(session.endedAt).toBeNull()
    })

    it('starting a new session ends any dangling active one', () => {
        const store = useConversationsStore()
        const first = startDefault(store)
        const second = startDefault(store)

        expect(store.sessions.find(s => s.id === first.id)?.endedAt).not.toBeNull()
        expect(store.activeSession?.id).toBe(second.id)
    })

    it('appends messages and preserves them in order', () => {
        const store = useConversationsStore()
        const session = startDefault(store)

        store.appendMessage(session.id, learnerMessage('Hello!'))
        store.appendMessage(session.id, {
            role: 'tutor', text: 'Hi there!', inputMethod: null,
            voiceConfidence: null, corrections: [], translation: null,
        })

        const stored = store.sessions.find(s => s.id === session.id)!

        expect(stored.messages.map(m => m.text)).toEqual(['Hello!', 'Hi there!'])
    })

    it('ending with a summary stores it; sessions are never overwritten by new ones', () => {
        const store = useConversationsStore()
        const session = startDefault(store)
        store.appendMessage(session.id, learnerMessage('Hello'))
        store.endSession(session.id, SUMMARY)

        const second = startDefault(store)
        store.appendMessage(second.id, learnerMessage('Different session'))

        const first = store.sessions.find(s => s.id === session.id)!

        expect(first.summary?.overall).toBe('Good session.')
        expect(first.messages[0].text).toBe('Hello')
    })

    it('deleteSession removes the session and its data', () => {
        const store = useConversationsStore()
        const session = startDefault(store)
        store.appendMessage(session.id, learnerMessage('To be deleted'))
        store.endSession(session.id)

        store.deleteSession(session.id)

        expect(store.sessions.find(s => s.id === session.id)).toBeUndefined()
    })

    it('persists across store instances (versioned storage)', () => {
        const first = useConversationsStore()
        const session = startDefault(first)
        first.appendMessage(session.id, learnerMessage('Persisted'))
        first.endSession(session.id)

        setActivePinia(createPinia())
        const second = useConversationsStore()

        expect(second.sessions).toHaveLength(1)
        expect(second.sessions[0].messages[0].text).toBe('Persisted')
    })

    it('caps stored sessions, dropping the oldest ENDED ones first', () => {
        const store = useConversationsStore()

        for (let i = 0; i < 35; i++) {
            const session = startDefault(store)
            session.startedAt = 1000 + i
            store.endSession(session.id)
        }

        const active = startDefault(store)

        expect(store.sessions.length).toBeLessThanOrEqual(30)
        expect(store.sessions.some(s => s.id === active.id)).toBe(true)
    })

    it('recentSummaries returns only sessions that have summaries, newest first', () => {
        const store = useConversationsStore()

        const a = startDefault(store)
        a.startedAt = 1000
        store.endSession(a.id, { ...SUMMARY, overall: 'older' })

        const b = startDefault(store)
        b.startedAt = 2000
        store.endSession(b.id)

        const c = startDefault(store)
        c.startedAt = 3000
        store.endSession(c.id, { ...SUMMARY, overall: 'newer' })

        const summaries = store.recentSummaries(5)

        expect(summaries.map(s => s.overall)).toEqual(['newer', 'older'])
    })

    it('migration drops malformed stored entries without crashing', () => {
        localStorage.setItem(
            'english-upgrade-conversations',
            JSON.stringify({ __version: 1, data: [{ bad: true }, null, { id: 'ok', messages: [], mode: 'free', endedAt: 1 }] })
        )

        const store = useConversationsStore()

        expect(store.sessions).toHaveLength(1)
        expect(store.sessions[0].id).toBe('ok')
    })
})
