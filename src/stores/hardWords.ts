import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
    createVersionedRepository,
} from '../persistence/versionedStorage'

import { useToastStore } from './toast'

const STORAGE_KEY = 'english-upgrade-hard-words'

const STORAGE_VERSION = 1

export interface HardWordSource {
    context?: string
    contexts?: string[]
    module?: string
    courseId?: string
    lessonId?: string
}

export interface HardWord {
    word: string
    meaning: string
    addedAt: number
    source?: HardWordSource
}

const repository = createVersionedRepository<HardWord[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStoredHardWords,
})

export const useHardWordsStore = defineStore(
    'hardWords',
    () => {
        const { value: initialHardWords, migratedFromLegacy } =
            repository.load()

        const hardWords = ref<HardWord[]>(initialHardWords)

        if (migratedFromLegacy && initialHardWords.length) {
            useToastStore().push(
                'Existing hard words were migrated to the new storage format.',
                'info'
            )
        }

        const wordIds = computed(() => {
            return new Set(
                hardWords.value.map(
                    item => item.word
                )
            )
        })

        function normalizeWord(word: string): string {
            return word.trim().toLowerCase()
        }

        function isHardWord(word: string): boolean {
            const normalized = normalizeWord(word)

            return hardWords.value.some(
                item => normalizeWord(item.word) === normalized
            )
        }

        function addWord(word: string, meaning: string, source?: HardWordSource) {
            const normalized = normalizeWord(word)

            if (isHardWord(normalized)) {
                const existing = hardWords.value.find(item => normalizeWord(item.word) === normalized)
                if (existing && (source || meaning)) {
                    if (source) existing.source = mergeSources(existing.source, source)
                    existing.meaning = mergeMeanings(existing.meaning, meaning)
                    save()
                }
                return
            }

            hardWords.value.push({
                word: normalized,
                meaning,
                addedAt: Date.now(),
                ...(source ? { source } : {}),
            })

            save()
        }

        function removeWord(word: string) {
            const normalized = normalizeWord(word)

            hardWords.value =
                hardWords.value.filter(
                    item =>
                        normalizeWord(item.word) !== normalized
                )

            save()
        }

        function toggleWord(
            word: string,
            meaning: string,
            source?: HardWordSource,
        ) {
            if (isHardWord(word)) {
                removeWord(word)
            } else {
                addWord(word, meaning, source)
            }
        }

        function clear() {
            hardWords.value = []
            save()
        }

        function save() {
            repository.save(hardWords.value)
        }

        return {
            hardWords,
            wordIds,
            isHardWord,
            addWord,
            removeWord,
            toggleWord,
            clear,
        }
    }
)

function mergeSources(existing: HardWordSource | undefined, incoming: HardWordSource): HardWordSource {
    const contexts = [...new Set([
        ...(existing?.contexts ?? []),
        ...(existing?.context ? [existing.context] : []),
        ...(incoming.contexts ?? []),
        ...(incoming.context ? [incoming.context] : []),
    ].map(value => value.trim()).filter(Boolean))]

    return {
        ...(existing ?? {}),
        ...incoming,
        ...(contexts.length ? { context: contexts[0], contexts } : {}),
    }
}

function mergeMeanings(existing: string, incoming: string): string {
    const values = [...existing.split(/[؛;]/u), ...incoming.split(/[؛;]/u)]
        .map(value => value.trim())
        .filter(Boolean)
    const seen = new Set<string>()
    return values.filter(value => {
        const key = value.normalize('NFC').toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    }).join('؛ ')
}

function migrateStoredHardWords(
    raw: unknown,
    _storedVersion: number | null
): HardWord[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw
        .filter(
            (item): item is Record<string, unknown> =>
                !!item &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).word === 'string'
        )
        .map(item => ({
            word: String(item.word).trim().toLowerCase(),
            meaning: typeof item.meaning === 'string' ? item.meaning : '',
            addedAt: Number(item.addedAt) || Date.now(),
            ...(item.source && typeof item.source === 'object' ? {
                source: {
                    ...(typeof (item.source as Record<string, unknown>).context === 'string' ? { context: (item.source as Record<string, unknown>).context as string } : {}),
                    ...(Array.isArray((item.source as Record<string, unknown>).contexts) ? { contexts: ((item.source as Record<string, unknown>).contexts as unknown[]).filter((value): value is string => typeof value === 'string') } : {}),
                    ...(typeof (item.source as Record<string, unknown>).module === 'string' ? { module: (item.source as Record<string, unknown>).module as string } : {}),
                    ...(typeof (item.source as Record<string, unknown>).courseId === 'string' ? { courseId: (item.source as Record<string, unknown>).courseId as string } : {}),
                    ...(typeof (item.source as Record<string, unknown>).lessonId === 'string' ? { lessonId: (item.source as Record<string, unknown>).lessonId as string } : {}),
                },
            } : {}),
        }))
        .filter(item => item.word)
}
