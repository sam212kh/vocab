import { ref } from 'vue';
import { defineStore } from 'pinia';
import { calculateNextReview, } from '../services/spacedRepetition';
const STORAGE_KEY = 'english-upgrade-word-progress';
const VALID_STATUSES = [
    'new',
    'learning',
    'reviewing',
    'mastered',
];
export const useWordProgressStore = defineStore('wordProgress', () => {
    const progress = ref(loadFromStorage());
    function normalizeWord(word) {
        return word
            .trim()
            .toLowerCase();
    }
    function normalizeProgress(item) {
        if (typeof item.wordId !==
            'string') {
            return null;
        }
        const wordId = normalizeWord(item.wordId);
        if (!wordId) {
            return null;
        }
        const status = VALID_STATUSES.includes(item.status)
            ? item.status
            : 'new';
        return {
            wordId,
            courseId: typeof item.courseId ===
                'string'
                ? item.courseId
                : '',
            lessonId: typeof item.lessonId ===
                'string'
                ? item.lessonId
                : '',
            status,
            level: typeof item.level ===
                'number' &&
                Number.isFinite(item.level)
                ? Math.max(0, Math.min(5, Math.floor(item.level)))
                : 0,
            pos: typeof item.pos ===
                'string'
                ? item.pos
                : '',
            correctAnswers: typeof item.correctAnswers ===
                'number' &&
                Number.isFinite(item.correctAnswers)
                ? Math.max(0, Math.floor(item.correctAnswers))
                : 0,
            wrongAnswers: typeof item.wrongAnswers ===
                'number' &&
                Number.isFinite(item.wrongAnswers)
                ? Math.max(0, Math.floor(item.wrongAnswers))
                : 0,
            streak: typeof item.streak ===
                'number' &&
                Number.isFinite(item.streak)
                ? Math.max(0, Math.floor(item.streak))
                : 0,
            lastReviewedAt: typeof item.lastReviewedAt ===
                'number' &&
                Number.isFinite(item.lastReviewedAt)
                ? item.lastReviewedAt
                : null,
            nextReviewAt: typeof item.nextReviewAt ===
                'number' &&
                Number.isFinite(item.nextReviewAt)
                ? item.nextReviewAt
                : null,
            practicePriority: typeof item.practicePriority ===
                'number' &&
                Number.isFinite(item.practicePriority)
                ? Math.max(0, Math.floor(item.practicePriority))
                : 0,
        };
    }
    function getProgress(word, courseId = '', lessonId = '') {
        const normalized = normalizeWord(word);
        let existing = progress.value.find(item => normalizeWord(item.wordId) === normalized);
        if (existing) {
            /*
             * Old records may not have
             * source information.
             *
             * Fill it only when we now
             * know the source.
             */
            let changed = false;
            if (!existing.courseId &&
                courseId) {
                existing.courseId =
                    courseId;
                changed = true;
            }
            if (!existing.lessonId &&
                lessonId) {
                existing.lessonId =
                    lessonId;
                changed = true;
            }
            if (changed) {
                save();
            }
            return existing;
        }
        const newProgress = {
            wordId: normalized,
            courseId,
            lessonId,
            status: 'new',
            level: 0,
            pos: '',
            correctAnswers: 0,
            wrongAnswers: 0,
            streak: 0,
            lastReviewedAt: null,
            nextReviewAt: null,
            practicePriority: 0,
        };
        progress.value.push(newProgress);
        save();
        return newProgress;
    }
    function recordCorrect(word, courseId = '', lessonId = '') {
        const item = getProgress(word, courseId, lessonId);
        item.correctAnswers++;
        item.streak++;
        item.lastReviewedAt =
            Date.now();
        item.level =
            Math.min(item.level + 1, 5);
        if (item.streak >= 5) {
            item.status =
                'mastered';
        }
        else if (item.streak >= 2) {
            item.status =
                'reviewing';
        }
        else {
            item.status =
                'learning';
        }
        item.practicePriority =
            Math.max(0, item.practicePriority -
                1);
        item.nextReviewAt =
            calculateNextReview(item, true);
        save();
    }
    function recordWrong(word, courseId = '', lessonId = '') {
        const item = getProgress(word, courseId, lessonId);
        item.wrongAnswers++;
        item.streak = 0;
        item.status =
            'learning';
        item.practicePriority++;
        item.lastReviewedAt =
            Date.now();
        item.nextReviewAt =
            calculateNextReview(item, false);
        save();
    }
    function isDue(word) {
        const item = getProgress(word);
        if (item.nextReviewAt ===
            null) {
            return true;
        }
        return (item.nextReviewAt <=
            Date.now());
    }
    function getDueWords() {
        const now = Date.now();
        return progress.value
            .filter(item => {
            return (item.nextReviewAt ===
                null ||
                item.nextReviewAt <=
                    now);
        })
            .sort((a, b) => {
            /*
             * Higher priority first.
             */
            if (a.practicePriority !==
                b.practicePriority) {
                return (b.practicePriority -
                    a.practicePriority);
            }
            /*
             * Older reviews first.
             */
            return ((a.nextReviewAt ??
                0) -
                (b.nextReviewAt ??
                    0));
        });
    }
    function resetWord(word) {
        const normalized = normalizeWord(word);
        progress.value =
            progress.value.filter(item => normalizeWord(item.wordId) !== normalized);
        save();
    }
    function clear() {
        progress.value = [];
        save();
    }
    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress.value));
    }
    return {
        progress,
        getProgress,
        recordCorrect,
        recordWrong,
        isDue,
        getDueWords,
        resetWord,
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
        const normalized = [];
        const seen = new Set();
        for (const item of parsed) {
            const result = normalizeStoredProgress(item);
            if (!result) {
                continue;
            }
            /*
             * Prevent duplicate Progress
             * records for the same word.
             */
            if (seen.has(result.wordId)) {
                continue;
            }
            seen.add(result.wordId);
            normalized.push(result);
        }
        return normalized;
    }
    catch {
        return [];
    }
}
function normalizeStoredProgress(item) {
    if (!item ||
        typeof item !== 'object') {
        return null;
    }
    const value = item;
    if (typeof value.wordId !==
        'string') {
        return null;
    }
    const wordId = value.wordId
        .trim()
        .toLowerCase();
    if (!wordId) {
        return null;
    }
    const status = VALID_STATUSES.includes(value.status)
        ? value.status
        : 'new';
    return {
        wordId,
        courseId: typeof value.courseId ===
            'string'
            ? value.courseId
            : '',
        lessonId: typeof value.lessonId ===
            'string'
            ? value.lessonId
            : '',
        status,
        level: typeof value.level ===
            'number' &&
            Number.isFinite(value.level)
            ? Math.max(0, Math.min(5, Math.floor(value.level)))
            : 0,
        pos: typeof value.pos ===
            'string'
            ? value.pos
            : '',
        correctAnswers: typeof value.correctAnswers ===
            'number' &&
            Number.isFinite(value.correctAnswers)
            ? Math.max(0, Math.floor(value.correctAnswers))
            : 0,
        wrongAnswers: typeof value.wrongAnswers ===
            'number' &&
            Number.isFinite(value.wrongAnswers)
            ? Math.max(0, Math.floor(value.wrongAnswers))
            : 0,
        streak: typeof value.streak ===
            'number' &&
            Number.isFinite(value.streak)
            ? Math.max(0, Math.floor(value.streak))
            : 0,
        lastReviewedAt: typeof value.lastReviewedAt ===
            'number' &&
            Number.isFinite(value.lastReviewedAt)
            ? value.lastReviewedAt
            : null,
        nextReviewAt: typeof value.nextReviewAt ===
            'number' &&
            Number.isFinite(value.nextReviewAt)
            ? value.nextReviewAt
            : null,
        practicePriority: typeof value.practicePriority ===
            'number' &&
            Number.isFinite(value.practicePriority)
            ? Math.max(0, Math.floor(value.practicePriority))
            : 0,
    };
}
