import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'english-upgrade-hard-words'

interface HardWord {
    word: string
    meaning: string
    addedAt: number
}

export const useHardWordsStore = defineStore(
    'hardWords',
    () => {
        const hardWords = ref<HardWord[]>(
            loadFromStorage()
        )

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

        function addWord(word: string,     meaning: string) {
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
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(hardWords.value)
            )
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

function loadFromStorage(): HardWord[] {
    try {
        const stored =
            localStorage.getItem(STORAGE_KEY)

        if (!stored) {
            return []
        }

        const parsed = JSON.parse(stored)

        if (!Array.isArray(parsed)) {
            return []
        }

        return parsed
    } catch {
        return []
    }
}