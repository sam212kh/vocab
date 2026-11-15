import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSavedExpressionsStore } from './savedExpressions'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('savedExpressions store', () => {
    it('saves an expression with its source session', () => {
        const store = useSavedExpressionsStore()

        store.saveExpression('by the way', 'introduces a new topic', 'راستی', 'conv-1')

        expect(store.expressions).toHaveLength(1)
        expect(store.expressions[0].sourceSessionId).toBe('conv-1')
    })

    it('deduplicates case-insensitively', () => {
        const store = useSavedExpressionsStore()

        store.saveExpression('By the way')
        store.saveExpression('by the way')

        expect(store.expressions).toHaveLength(1)
    })

    it('detachSession unlinks expressions when a conversation is deleted, keeping the expression', () => {
        const store = useSavedExpressionsStore()
        store.saveExpression('push back on', 'politely disagree', '', 'conv-9')

        store.detachSession('conv-9')

        expect(store.expressions[0].sourceSessionId).toBeNull()
        expect(store.expressions[0].expression).toBe('push back on')
    })

    it('persists across store instances', () => {
        const first = useSavedExpressionsStore()
        first.saveExpression('meet in the middle')

        setActivePinia(createPinia())
        const second = useSavedExpressionsStore()

        expect(second.expressions).toHaveLength(1)
    })
})
