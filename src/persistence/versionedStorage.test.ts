import { describe, expect, it } from 'vitest'

import { createVersionedRepository } from './versionedStorage'

interface Thing {
    id: string
    count: number
}

describe('createVersionedRepository', () => {
    it('returns the default value when nothing is stored', () => {
        const repo = createVersionedRepository<Thing[]>({
            key: 'test-empty',
            version: 1,
            defaultValue: () => [],
            migrate: raw => (Array.isArray(raw) ? (raw as Thing[]) : []),
        })

        const result = repo.load()

        expect(result.value).toEqual([])
        expect(result.migratedFromLegacy).toBe(false)
    })

    it('round-trips a save/load through the versioned envelope', () => {
        const repo = createVersionedRepository<Thing[]>({
            key: 'test-roundtrip',
            version: 1,
            defaultValue: () => [],
            migrate: raw => (Array.isArray(raw) ? (raw as Thing[]) : []),
        })

        repo.save([{ id: 'a', count: 1 }])

        const result = repo.load()

        expect(result.value).toEqual([{ id: 'a', count: 1 }])
        expect(result.migratedFromLegacy).toBe(false)
    })

    it('detects and migrates pre-envelope legacy data without losing it', () => {
        localStorage.setItem(
            'test-legacy',
            JSON.stringify([{ id: 'legacy', count: 42 }])
        )

        const repo = createVersionedRepository<Thing[]>({
            key: 'test-legacy',
            version: 1,
            defaultValue: () => [],
            migrate: raw => (Array.isArray(raw) ? (raw as Thing[]) : []),
        })

        const result = repo.load()

        expect(result.value).toEqual([{ id: 'legacy', count: 42 }])
        expect(result.migratedFromLegacy).toBe(true)
    })

    it('falls back to the default value on corrupted JSON instead of throwing', () => {
        localStorage.setItem('test-corrupt', '{not valid json')

        const repo = createVersionedRepository<Thing[]>({
            key: 'test-corrupt',
            version: 1,
            defaultValue: () => [],
            migrate: raw => (Array.isArray(raw) ? (raw as Thing[]) : []),
        })

        expect(() => repo.load()).not.toThrow()
        expect(repo.load().value).toEqual([])
    })

    it('clear removes the stored value', () => {
        const repo = createVersionedRepository<Thing[]>({
            key: 'test-clear',
            version: 1,
            defaultValue: () => [],
            migrate: raw => (Array.isArray(raw) ? (raw as Thing[]) : []),
        })

        repo.save([{ id: 'a', count: 1 }])
        repo.clear()

        expect(repo.load().value).toEqual([])
    })
})
