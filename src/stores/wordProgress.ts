import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
    calculateNextReview,
} from '../services/spacedRepetition'

import type {
    WordProgress,
    WordStatus,
} from '../types/vocabulary'

const STORAGE_KEY =
    'english-upgrade-word-progress'

const VALID_STATUSES: WordStatus[] = [
    'new',
    'learning',
    'reviewing',
    'mastered',
]

export const useWordProgressStore =
    defineStore(
        'wordProgress',
        () => {
            const progress =
                ref<WordProgress[]>(
                    loadFromStorage()
                )

            function normalizeWord(
                word: string
            ): string {
                return word
                    .trim()
                    .toLowerCase()
            }

            function getProgress(
                word: string,
                courseId = '',
                lessonId = ''
            ): WordProgress {
                const normalized =
                    normalizeWord(word)

                let existing =
                    progress.value.find(
                        item =>
                            normalizeWord(
                                item.wordId
                            ) === normalized
                    )

                if (existing) {
                    /*
                     * Old records may not have
                     * source information.
                     *
                     * Fill it only when we now
                     * know the source.
                     */
                    let changed = false

                    if (
                        !existing.courseId &&
                        courseId
                    ) {
                        existing.courseId =
                            courseId

                        changed = true
                    }

                    if (
                        !existing.lessonId &&
                        lessonId
                    ) {
                        existing.lessonId =
                            lessonId

                        changed = true
                    }

                    if (changed) {
                        save()
                    }

                    return existing
                }

                const newProgress:
                    WordProgress = {
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

                    easeFactor: 2.5,

                    intervalDays: 0,
                }

                progress.value.push(
                    newProgress
                )

                save()

                return newProgress
            }

            function recordCorrect(
                word: string,
                courseId = '',
                lessonId = ''
            ) {
                const item =
                    getProgress(
                        word,
                        courseId,
                        lessonId
                    )

                /*
                 * Derive SM-2 quality from the streak
                 * BEFORE it is incremented below, so a
                 * fresh/just-recovered word is graded
                 * as a bare pass rather than a confident
                 * repeat.
                 */
                const schedule =
                    calculateNextReview(
                        item,
                        true
                    )

                item.correctAnswers++

                item.streak++

                item.lastReviewedAt =
                    Date.now()

                item.level =
                    Math.min(
                        item.level + 1,
                        5
                    )

                if (
                    item.streak >= 5
                ) {
                    item.status =
                        'mastered'
                } else if (
                    item.streak >= 2
                ) {
                    item.status =
                        'reviewing'
                } else {
                    item.status =
                        'learning'
                }

                item.practicePriority =
                    Math.max(
                        0,
                        item.practicePriority -
                        1
                    )

                item.easeFactor =
                    schedule.easeFactor

                item.intervalDays =
                    schedule.intervalDays

                item.nextReviewAt =
                    schedule.nextReviewAt

                save()
            }

            function recordWrong(
                word: string,
                courseId = '',
                lessonId = ''
            ) {
                const item =
                    getProgress(
                        word,
                        courseId,
                        lessonId
                    )

                const schedule =
                    calculateNextReview(
                        item,
                        false
                    )

                item.wrongAnswers++

                item.streak = 0

                item.status =
                    'learning'

                item.practicePriority++

                item.lastReviewedAt =
                    Date.now()

                item.easeFactor =
                    schedule.easeFactor

                item.intervalDays =
                    schedule.intervalDays

                item.nextReviewAt =
                    schedule.nextReviewAt

                save()
            }

            function isDue(
                word: string
            ): boolean {
                const item =
                    getProgress(word)

                if (
                    item.nextReviewAt ===
                    null
                ) {
                    return true
                }

                return (
                    item.nextReviewAt <=
                    Date.now()
                )
            }

            function getDueWords():
                WordProgress[] {
                const now =
                    Date.now()

                return progress.value
                    .filter(item => {
                        return (
                            item.nextReviewAt ===
                            null ||
                            item.nextReviewAt <=
                            now
                        )
                    })
                    .sort(
                        (
                            a,
                            b
                        ) => {
                            /*
                             * Higher priority first.
                             */
                            if (
                                a.practicePriority !==
                                b.practicePriority
                            ) {
                                return (
                                    b.practicePriority -
                                    a.practicePriority
                                )
                            }

                            /*
                             * Older reviews first.
                             */
                            return (
                                (a.nextReviewAt ??
                                    0) -
                                (b.nextReviewAt ??
                                    0)
                            )
                        }
                    )
            }

            function resetWord(
                word: string
            ) {
                const normalized =
                    normalizeWord(word)

                progress.value =
                    progress.value.filter(
                        item =>
                            normalizeWord(
                                item.wordId
                            ) !== normalized
                    )

                save()
            }

            function clear() {
                progress.value = []

                save()
            }

            function save() {
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(
                        progress.value
                    )
                )
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
            }
        }
    )

function loadFromStorage():
    WordProgress[] {
    try {
        const stored =
            localStorage.getItem(
                STORAGE_KEY
            )

        if (!stored) {
            return []
        }

        const parsed =
            JSON.parse(stored)

        if (!Array.isArray(parsed)) {
            return []
        }

        const normalized: WordProgress[] =
            []

        const seen =
            new Set<string>()

        for (
            const item of parsed
            ) {
            const result =
                normalizeStoredProgress(
                    item
                )

            if (!result) {
                continue
            }

            /*
             * Prevent duplicate Progress
             * records for the same word.
             */
            if (
                seen.has(
                    result.wordId
                )
            ) {
                continue
            }

            seen.add(
                result.wordId
            )

            normalized.push(
                result
            )
        }

        return normalized
    } catch {
        return []
    }
}

function normalizeStoredProgress(
    item: unknown
): WordProgress | null {
    if (
        !item ||
        typeof item !== 'object'
    ) {
        return null
    }

    const value =
        item as Partial<WordProgress>

    if (
        typeof value.wordId !==
        'string'
    ) {
        return null
    }

    const wordId =
        value.wordId
            .trim()
            .toLowerCase()

    if (!wordId) {
        return null
    }

    const status =
        VALID_STATUSES.includes(
            value.status as WordStatus
        )
            ? (value.status as WordStatus)
            : 'new'

    return {
        wordId,

        courseId:
            typeof value.courseId ===
            'string'
                ? value.courseId
                : '',

        lessonId:
            typeof value.lessonId ===
            'string'
                ? value.lessonId
                : '',

        status,

        level:
            typeof value.level ===
            'number' &&
            Number.isFinite(
                value.level
            )
                ? Math.max(
                    0,
                    Math.min(
                        5,
                        Math.floor(
                            value.level
                        )
                    )
                )
                : 0,

        pos:
            typeof value.pos ===
            'string'
                ? value.pos
                : '',

        correctAnswers:
            typeof value.correctAnswers ===
            'number' &&
            Number.isFinite(
                value.correctAnswers
            )
                ? Math.max(
                    0,
                    Math.floor(
                        value.correctAnswers
                    )
                )
                : 0,

        wrongAnswers:
            typeof value.wrongAnswers ===
            'number' &&
            Number.isFinite(
                value.wrongAnswers
            )
                ? Math.max(
                    0,
                    Math.floor(
                        value.wrongAnswers
                    )
                )
                : 0,

        streak:
            typeof value.streak ===
            'number' &&
            Number.isFinite(
                value.streak
            )
                ? Math.max(
                    0,
                    Math.floor(
                        value.streak
                    )
                )
                : 0,

        lastReviewedAt:
            typeof value.lastReviewedAt ===
            'number' &&
            Number.isFinite(
                value.lastReviewedAt
            )
                ? value.lastReviewedAt
                : null,

        nextReviewAt:
            typeof value.nextReviewAt ===
            'number' &&
            Number.isFinite(
                value.nextReviewAt
            )
                ? value.nextReviewAt
                : null,

        practicePriority:
            typeof value.practicePriority ===
            'number' &&
            Number.isFinite(
                value.practicePriority
            )
                ? Math.max(
                    0,
                    Math.floor(
                        value.practicePriority
                    )
                )
                : 0,

        easeFactor:
            typeof value.easeFactor ===
            'number' &&
            Number.isFinite(
                value.easeFactor
            )
                ? Math.max(1.3, value.easeFactor)
                : 2.5,

        intervalDays:
            typeof value.intervalDays ===
            'number' &&
            Number.isFinite(
                value.intervalDays
            )
                ? Math.max(0, value.intervalDays)
                : 0,
    }
}