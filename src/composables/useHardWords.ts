import { ref } from 'vue'

const hardWordIds = ref<string[]>([])

export function useHardWords() {
    function isHardWord(wordId: string): boolean {
        return hardWordIds.value.includes(wordId)
    }

    function toggleHardWord(wordId: string): void {
        if (isHardWord(wordId)) {
            hardWordIds.value = hardWordIds.value.filter(
                id => id !== wordId
            )
        } else {
            hardWordIds.value.push(wordId)
        }
    }

    return {
        hardWordIds,
        isHardWord,
        toggleHardWord,
    }
}