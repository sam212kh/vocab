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

    it('preserves source context when a word is saved', () => {
        const store = useHardWordsStore()

        store.addWord('approach', 'رویکرد', { module: 'vocabulary-lesson', courseId: 'upgrade', lessonId: 'batch-01', context: 'Her approach was careful.' })

        expect(store.hardWords[0].source).toEqual({ module: 'vocabulary-lesson', courseId: 'upgrade', lessonId: 'batch-01', context: 'Her approach was careful.' })
    })

    it('merges contexts when the same canonical word is encountered again', () => {
        const store = useHardWordsStore()

        store.addWord('attendance', 'حضور؛ غیبت', { module: 'reading', context: 'The attendance policy changed.' })
        store.addWord('ATTENDANCE', 'حضور؛ غیبت', { module: 'conversation', context: 'Attendance matters here.' })

        expect(store.hardWords).toHaveLength(1)
        expect(store.hardWords[0].meaning).toBe('حضور؛ غیبت')
        expect(store.hardWords[0].source?.contexts).toEqual([
            'The attendance policy changed.',
            'Attendance matters here.',
        ])
    })

    it('keeps newly verified meanings when an existing word is saved again', () => {
        const store = useHardWordsStore()

        store.addWord('approach', 'رویکرد', { context: 'An approach to the problem.' })
        store.addWord('approach', 'نزدیک شدن', { context: 'The train will approach.' })

        expect(store.hardWords[0].meaning).toBe('رویکرد؛ نزدیک شدن')
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
