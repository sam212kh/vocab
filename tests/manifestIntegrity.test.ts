import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { Manifest } from '../src/types/vocabulary'

/*
 * This is a filesystem-level regression test for the exact class of bug
 * found in Phase 1: manifest.json's course "hard" batch-09 entry pointed at
 * "./hard/batch-01.json" instead of its own file. The app serves
 * /data/manifest.json straight out of public/ at runtime (a stale src/data
 * mirror existed until Phase 3 cleanup), so this test reads the real
 * served copy.
 */

const here = dirname(fileURLToPath(import.meta.url))
const publicDataDir = resolve(here, '../public/data')
const manifestPath = join(publicDataDir, 'manifest.json')

const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

describe('public/data/manifest.json integrity', () => {
    it('every lesson file reference resolves to a real file on disk', () => {
        const missing: string[] = []

        for (const course of manifest.courses) {
            for (const lesson of course.lessons) {
                const path = join(publicDataDir, lesson.file)

                if (!existsSync(path)) {
                    missing.push(`${course.id}/${lesson.id} -> ${lesson.file}`)
                }
            }
        }

        expect(missing).toEqual([])
    })

    it('lesson ids are unique within each course', () => {
        for (const course of manifest.courses) {
            const ids = course.lessons.map(lesson => lesson.id)
            const uniqueIds = new Set(ids)

            expect(uniqueIds.size, `duplicate lesson id in course "${course.id}"`).toBe(ids.length)
        }
    })

    it('no two lessons in the same course point at the same file (the batch-09 regression)', () => {
        for (const course of manifest.courses) {
            const files = course.lessons.map(lesson => lesson.file)
            const uniqueFiles = new Set(files)

            expect(uniqueFiles.size, `duplicate file reference in course "${course.id}"`).toBe(files.length)
        }
    })

    it('course ids are unique', () => {
        const ids = manifest.courses.map(course => course.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
