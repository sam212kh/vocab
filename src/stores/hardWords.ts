import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
    createVersionedRepository,
} from '../persistence/versionedStorage'

import { useToastStore } from './toast'

const STORAGE_KEY = 'english-upgrade-hard-words'

const STORAGE_VERSION = 1

interface HardWord {
    word: string
    meaning: string
    addedAt: number
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

        function addWord(word: string, meaning: string) {
            const normalized = normalizeWord(word)

            if (isHardWord(normalized)) {
                return
            }

            hardWords.value.push({
                word: normalized,
                meaning,
                addedAt: Date.now(),
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
            meaning: string
        ) {
            if (isHardWord(word)) {
                removeWord(word)
            } else {
                addWord(word, meaning)
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
        }))
        .filter(item => item.word)
}
