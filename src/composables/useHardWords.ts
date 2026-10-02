import { computed, ref } from 'vue'

interface HardWord {
    word: string
    meaning: string
    addedAt: number
}

const STORAGE_KEY = 'english-upgrade-hard-words'

const hardWords = ref<HardWord[]>(loadHardWords())

function normalizeWord(word: string): string {
    return word.trim().toLowerCase()
}

function loadHardWords(): HardWord[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)

        if (!stored) {
            return []
        }

        const parsed = JSON.parse(stored)

        if (!Array.isArray(parsed)) {
            return []
        }

        return parsed
            .filter(
                item =>
                    item &&
                    typeof item.word === 'string'
            )
            .map(item => ({
                word: normalizeWord(item.word),
                meaning: typeof item.meaning === 'string'
                    ? item.meaning
                    : '',
                addedAt: Number(item.addedAt) || Date.now(),
            }))
    } catch {
        return []
    }
}

function saveHardWords() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(hardWords.value)
    )
}

function isHardWord(word: string): boolean {
    const normalized = normalizeWord(word)

    return hardWords.value.some(
        item => item.word === normalized
    )
}

function addHardWord(
    word: string,
    meaning: string
) {
    const normalized = normalizeWord(word)

    if (!normalized || isHardWord(normalized)) {
        return
    }

    hardWords.value.push({
        word: normalized,
        meaning,
        addedAt: Date.now(),
    })

    saveHardWords()
}

function removeHardWord(word: string) {
    const normalized = normalizeWord(word)

    hardWords.value = hardWords.value.filter(
        item => item.word !== normalized
    )

    saveHardWords()
}

function toggleHardWord(
    word: string,
    meaning: string
) {
    if (isHardWord(word)) {
        removeHardWord(word)
    } else {
        addHardWord(word, meaning)
    }
}

export function useHardWords() {
    return {
        hardWords: computed(() => hardWords.value),
        isHardWord,
        addHardWord,
        removeHardWord,
        toggleHardWord,
    }
}