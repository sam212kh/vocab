import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
const STORAGE_KEY = 'english-upgrade-hard-words';
export const useHardWordsStore = defineStore('hardWords', () => {
    const hardWords = ref(loadFromStorage());
    const wordIds = computed(() => {
        return new Set(hardWords.value.map(item => item.word));
    });
    function normalizeWord(word) {
        return word.trim().toLowerCase();
    }
    function isHardWord(word) {
        const normalized = normalizeWord(word);
        return hardWords.value.some(item => normalizeWord(item.word) === normalized);
    }
    function addWord(word, meaning) {
        const normalized = normalizeWord(word);
        if (isHardWord(normalized)) {
            return;
        }
        hardWords.value.push({
            word: normalized,
            meaning,
            addedAt: Date.now(),
        });
        save();
    }
    function removeWord(word) {
        const normalized = normalizeWord(word);
        hardWords.value =
            hardWords.value.filter(item => normalizeWord(item.word) !== normalized);
        save();
    }
    function toggleWord(word, meaning) {
        if (isHardWord(word)) {
            removeWord(word);
        }
        else {
            addWord(word, meaning);
        }
    }
    function clear() {
        hardWords.value = [];
        save();
    }
    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(hardWords.value));
    }
    return {
        hardWords,
        wordIds,
        isHardWord,
        addWord,
        removeWord,
        toggleWord,
        clear,
    };
});
function loadFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return [];
        }
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed;
    }
    catch {
        return [];
    }
}
