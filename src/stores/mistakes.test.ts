import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useMistakesStore } from './mistakes'

import type { SentenceFeedback } from '../types/writing'

beforeEach(() => {
    setActivePinia(createPinia())
})

function sentence(overrides: Partial<SentenceFeedback> = {}): SentenceFeedback {
    return {
        original: 'I have seen him yesterday.',
        corrected: 'I saw him yesterday.',
        category: 'tense',
        kind: 'error',
        explanation: 'Finished time takes past simple.',
        explanationPersian: '',
        example: '',
        ...overrides,
    }
}

describe('mistakes store', () => {
    it('records normalized mistakes with frequency and submission links', () => {
        const store = useMistakesStore()

        store.recordFromEvaluation('sub-1', [sentence()])
        store.recordFromEvaluation('sub-2', [sentence({ original: 'She have gone home.' })])

        const record = store.mistakes.find(m => m.category === 'tense' && m.kind === 'error')

        expect(record).toBeDefined()
        expect(record!.count).toBe(2)
        expect(record!.submissionIds).toEqual(['sub-1', 'sub-2'])
        expect(record!.examples).toHaveLength(2)
    })

    it('re-evaluating the same submission does not inflate counts', () => {
        const store = useMistakesStore()

        store.recordFromEvaluation('sub-1', [sentence()])
        store.recordFromEvaluation('sub-1', [sentence()])

        expect(store.mistakes.find(m => m.category === 'tense')!.count).toBe(1)
    })

    it('keeps errors and style suggestions as distinct records', () => {
        const store = useMistakesStore()

        store.recordFromEvaluation('sub-1', [
            sentence({ category: 'naturalness', kind: 'style' }),
            sentence({ category: 'naturalness', kind: 'error', original: 'Other sentence here.' }),
        ])

        const styleRecord = store.mistakes.find(m => m.category === 'naturalness' && m.kind === 'style')
        const errorRecord = store.mistakes.find(m => m.category === 'naturalness' && m.kind === 'error')

        expect(styleRecord).toBeDefined()
        expect(errorRecord).toBeDefined()
    })

    it('recurringErrors includes only confirmed errors seen at least twice', () => {
        const store = useMistakesStore()

        store.recordFromEvaluation('sub-1', [
            sentence({ category: 'articles' }),
            sentence({ category: 'naturalness', kind: 'style', original: 'A valid but stiff phrase.' }),
        ])
        store.recordFromEvaluation('sub-2', [
            sentence({ category: 'articles', original: 'He is engineer.' }),
            sentence({ category: 'naturalness', kind: 'style', original: 'Another stiff phrase.' }),
        ])

        const categories = store.recurringErrorCategories()

        expect(categories).toContain('articles')
        expect(categories).not.toContain('naturalness')
    })

    it('persists across store instances', () => {
        const first = useMistakesStore()
        first.recordFromEvaluation('sub-1', [sentence()])

        setActivePinia(createPinia())
        const second = useMistakesStore()

        expect(second.mistakes).toHaveLength(1)
    })
})
