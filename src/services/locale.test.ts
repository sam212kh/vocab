import { beforeEach, describe, expect, it } from 'vitest'

import { setLocale, useLocale } from './locale'

describe('locale', () => {
    beforeEach(() => {
        localStorage.clear()
        setLocale('en')
    })

    it('translates the shared shell and persists the selected language', () => {
        const { t, setLocale: change } = useLocale()

        change('fa')

        expect(t('nav.dashboard')).toBe('داشبورد')
        expect(localStorage.getItem('english-upgrade-locale')).toBe('fa')
    })

    it('falls back to English for an untranslated key', () => {
        const { t, setLocale: change } = useLocale()

        change('fa')

        expect(t('app.name')).toBe('ارتقای انگلیسی')
        expect(t('missing.key')).toBe('missing.key')
    })
})
