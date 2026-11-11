import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { useToastStore } from './toast'

import type { SavedExpression } from '../types/conversation'

const STORAGE_KEY = 'english-upgrade-saved-expressions'

const STORAGE_VERSION = 1

const MAX_EXPRESSIONS = 300

const repository = createVersionedRepository<SavedExpression[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

export const useSavedExpressionsStore = defineStore('savedExpressions', () => {
    const { value: initial } = repository.load()

    const expressions = ref<SavedExpression[]>(initial)

    function saveExpression(
        expression: string,
        meaning = '',
        meaningPersian = '',
        sourceSessionId: string | null = null
    ) {
        const normalized = expression.trim()

        if (!normalized) return

        const exists = expressions.value.some(
            item => item.expression.toLowerCase() === normalized.toLowerCase()
        )

        if (exists) {
            useToastStore().push('Already saved.', 'info')
            return
        }

        expressions.value.push({
            expression: normalized,
            meaning,
            meaningPersian,
            sourceSessionId,
            savedAt: Date.now(),
        })

        if (expressions.value.length > MAX_EXPRESSIONS) {
            expressions.value = expressions.value.slice(-MAX_EXPRESSIONS)
        }

        save()
        useToastStore().push('Expression saved.', 'success')
    }

    function removeExpression(expression: string) {
        expressions.value = expressions.value.filter(
            item => item.expression !== expression
        )
        save()
    }

    /** Called when a conversation session is deleted — detach its links. */
    function detachSession(sessionId: string) {
        let changed = false

        for (const item of expressions.value) {
            if (item.sourceSessionId === sessionId) {
                item.sourceSessionId = null
                changed = true
            }
        }

        if (changed) save()
    }

    function clear() {
        expressions.value = []
        save()
    }

    function save() {
        repository.save(expressions.value)
    }

    return {
        expressions,
        saveExpression,
        removeExpression,
        detachSession,
        clear,
    }
})

function migrateStored(raw: unknown, _storedVersion: number | null): SavedExpression[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw.filter(
        (item): item is SavedExpression =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as SavedExpression).expression === 'string'
    )
}
