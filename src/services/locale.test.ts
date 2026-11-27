import { beforeEach, describe, expect, it } from 'vitest'

import { setLocale, translateText, translationKeys, useLocale } from './locale'

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

    it('provides Persian values for the Dashboard copy and formats dynamic values', () => {
        const { t, setLocale: change } = useLocale()
        const dashboardKeys = translationKeys('dashboard.')

        change('fa')

        expect(dashboardKeys.length).toBeGreaterThan(70)
        for (const key of dashboardKeys) {
            expect(t(key), key).not.toBe(key)
            expect(t(key).replace(/\{[^}]+\}/g, '')).not.toMatch(/[A-Za-z]{4,}/)
        }

        expect(t('dashboard.journeySummary', { done: '۳', total: '۵', minutes: '۱۸' }))
            .toBe('۳ مورد از ۵ فعالیت انجام شده؛ در مجموع حدود ۱۸ دقیقه.')
        expect(t('dashboard.reviewDueMany', { count: '۱۲' })).toBe('۱۲ واژه برای مرور آماده است')
    })

    it('never translates substrings inside learner or content text', () => {
        expect(translateText('12 day streak', 'fa')).toBe('12 day streak')
        expect(translateText('weekday', 'fa')).toBe('weekday')
        expect(translateText('My Daily progress lesson', 'fa')).toBe('My Daily progress lesson')
        expect(translateText('Daily progress', 'fa')).toBe('پیشرفت روزانه')
    })

    it('translates complete legacy UI labels without substring collisions', () => {
        expect(translateText('Your journey', 'fa')).toBe('مسیر شما')
        expect(translateText('Guided lesson', 'fa')).toBe('درس هدایت‌شده')
        expect(translateText('My guided lesson title', 'fa')).toBe('My guided lesson title')
    })

    it('provides localized shared audio and Hard Words labels', () => {
        const { t, setLocale: change } = useLocale()

        change('fa')

        expect(t('audio.play')).toBe('پخش صدا')
        expect(t('audio.playLabel', { label: 'approach' })).toBe('پخش صدای approach')
        expect(t('hardWords.saveTo')).toBe('ذخیره واژه در واژه‌های دشوار')
    })

    it('provides Persian values for the learning-path UI and dynamic requirements', () => {
        const { t, setLocale: change } = useLocale()
        const keys = translationKeys('roadmap.')

        change('fa')

        for (const key of keys) {
            expect(t(key), key).not.toBe(key)
        }

        expect(t('roadmap.requirement.recalls', { count: '25' })).toBe('25 یادآوری مستقل')
        expect(t('roadmap.stage.everyday-foundations.description')).toContain('واژه‌ها')
    })

    it('translates only anchored UI progress patterns', () => {
        expect(translateText('Step 2 / 4', 'fa')).toBe('گام 2 از 4')
        expect(translateText('Expression 1 of 5', 'fa')).toBe('عبارت 1 از 5')
        expect(translateText('weekday', 'fa')).toBe('weekday')
    })
})
