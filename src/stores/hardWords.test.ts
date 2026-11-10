import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useHardWordsStore } from './hardWords'

const STORAGE_KEY = 'english-upgrade-hard-words'

beforeEach(() => {
    setActivePinia(createPinia())
})

describe('hardWords store', () => {
    it('toggles a word on and off, normalizing case', () => {
        const store = useHardWordsStore()

        store.toggleWord('Abandon', 'to give up')
        expect(store.isHardWord('abandon')).toBe(true)
        expect(store.isHardWord('ABANDON')).toBe(true)

        store.toggleWord('abandon', 'to give up')
        expect(store.isHardWord('abandon')).toBe(false)
    })

    it('does not add the same word twice', () => {
        const store = useHardWordsStore()

        store.addWord('persist', 'ادامه دادن')
        store.addWord('persist', 'ادامه دادن')

        expect(store.hardWords).toHaveLength(1)
    })

    it('persists across store instances sharing the same localStorage key (single source of truth)', () => {
        const first = useHardWordsStore()
        first.addWord('consolidated', 'یکپارچه')

        setActivePinia(createPinia())
        const second = useHardWordsStore()

        expect(second.isHardWord('consolidated')).toBe(true)
    })

    it('migrates pre-existing legacy (un-enveloped) localStorage data', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([{ word: 'Legacy', meaning: 'قدیمی', addedAt: 123 }])
        )

        const store = useHardWordsStore()

        expect(store.hardWords).toHaveLength(1)
        expect(store.hardWords[0].word).toBe('legacy')
    })
})
