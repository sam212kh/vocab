import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'

import type { CefrLevel } from '../types/cefr'
import type {
    ConversationMessage,
    ConversationMode,
    ConversationSession,
    ConversationSummary,
    FeedbackMode,
} from '../types/conversation'

const STORAGE_KEY = 'english-upgrade-conversations'

const STORAGE_VERSION = 1

/** localStorage budget: keep the most recent sessions only. */
const MAX_SESSIONS = 30

/** Per-session message cap — very long sessions get trimmed from the front. */
const MAX_MESSAGES_PER_SESSION = 200

const repository = createVersionedRepository<ConversationSession[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useConversationsStore = defineStore('conversations', () => {
    const { value: initial } = repository.load()

    const sessions = ref<ConversationSession[]>(initial)

    const activeSession = computed(() =>
        sessions.value.find(session => session.endedAt === null) ?? null
    )

    let messageSequence = 0

    /* Date.now() alone collides when sessions are created in the same
     * millisecond — ids must be unique or endSession targets the wrong one. */
    let sessionSequence = 0

    function startSession(options: {
        mode: ConversationMode
        scenarioId?: string | null
        difficulty: CefrLevel
        feedbackMode: FeedbackMode
    }): ConversationSession {
        /* One active session at a time — ending any dangling one first. */
        for (const session of sessions.value) {
            if (session.endedAt === null) session.endedAt = Date.now()
        }

        const session: ConversationSession = {
            id: `conv-${Date.now()}-${sessionSequence++}`,
            mode: options.mode,
            scenarioId: options.scenarioId ?? null,
            difficulty: options.difficulty,
            feedbackMode: options.feedbackMode,
            startedAt: Date.now(),
            endedAt: null,
            messages: [],
            summary: null,
        }

        sessions.value.push(session)

        if (sessions.value.length > MAX_SESSIONS) {
            /* Oldest ended sessions go first; never drop the active one. */
            const removable = sessions.value
                .filter(item => item.endedAt !== null)
                .sort((a, b) => a.startedAt - b.startedAt)

            while (sessions.value.length > MAX_SESSIONS && removable.length) {
                const victim = removable.shift()!
                sessions.value = sessions.value.filter(item => item.id !== victim.id)
            }
        }

        save()

        return session
    }

    function appendMessage(
        sessionId: string,
        message: Omit<ConversationMessage, 'id' | 'timestamp'>
    ): ConversationMessage | null {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return null

        const full: ConversationMessage = {
            ...message,
            id: `${sessionId}-m${session.messages.length}-${messageSequence++}`,
            timestamp: Date.now(),
        }

        session.messages.push(full)

        if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
            session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION)
        }

        save()

        return full
    }

    function setCorrections(
        sessionId: string,
        messageId: string,
        corrections: ConversationMessage['corrections']
    ) {
        const message = sessions.value
            .find(item => item.id === sessionId)
            ?.messages.find(item => item.id === messageId)

        if (!message) return

        message.corrections = corrections
        save()
    }

    function setTranslation(sessionId: string, messageId: string, translation: string) {
        const message = sessions.value
            .find(item => item.id === sessionId)
            ?.messages.find(item => item.id === messageId)

        if (!message) return

        message.translation = translation
        save()
    }

    function changeFeedbackMode(sessionId: string, feedbackMode: FeedbackMode) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        session.feedbackMode = feedbackMode
        save()
    }

    function endSession(sessionId: string, summary: ConversationSummary | null = null) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        session.endedAt = Date.now()
        if (summary) session.summary = summary
        save()
    }

    function attachSummary(sessionId: string, summary: ConversationSummary) {
        const session = sessions.value.find(item => item.id === sessionId)

        if (!session) return

        session.summary = summary
        save()
    }

    /** Deletes the session AND everything stored about it here. */
    function deleteSession(sessionId: string) {
        sessions.value = sessions.value.filter(item => item.id !== sessionId)
        save()
    }

    const endedSessions = computed(() =>
        sessions.value
            .filter(session => session.endedAt !== null)
            .sort((a, b) => b.startedAt - a.startedAt)
    )

    /** Recent summaries for cross-session learner context (compact, never transcripts). */
    function recentSummaries(limit = 3): ConversationSummary[] {
        return endedSessions.value
            .map(session => session.summary)
            .filter((summary): summary is ConversationSummary => summary !== null)
            .slice(0, limit)
    }

    function clear() {
        sessions.value = []
        save()
    }

    function save() {
        repository.save(sessions.value)
    }

    return {
        sessions,
        activeSession,
        endedSessions,
        startSession,
        appendMessage,
        setCorrections,
        setTranslation,
        changeFeedbackMode,
        endSession,
        attachSummary,
        deleteSession,
        recentSummaries,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): ConversationSession[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is ConversationSession =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as ConversationSession).id === 'string' &&
            Array.isArray((item as ConversationSession).messages)
    )
}
