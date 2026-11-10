import { ref } from 'vue'
import { defineStore } from 'pinia'

import { calculateNextReview } from '../services/spacedRepetition'
import { createVersionedRepository } from '../persistence/versionedStorage'

import type { WordProgress } from '../types/vocabulary'

const STORAGE_KEY = 'english-upgrade-grammar-progress'

const STORAGE_VERSION = 1

export type GrammarTopicStatus = 'new' | 'learning' | 'reviewing' | 'mastered'

export interface GrammarTopicProgress {
    topicId: string
    status: GrammarTopicStatus
    correctAnswers: number
    wrongAnswers: number
    streak: number
    lastPracticedAt: number | null
    nextReviewAt: number | null
    easeFactor: number
    intervalDays: number
}

const repository = createVersionedRepository<GrammarTopicProgress[]>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => [],
    migrate: migrateStored,
})

/**
 * Topic-level mastery tracking, scheduled with the SAME SM-2 engine the
 * vocabulary review uses (services/spacedRepetition) — one retention
 * algorithm across the platform, not a parallel implementation.
 *
 * "Mastered" needs a sustained streak across sessions, not one good run:
 * a session outcome counts as one SM-2 rep for the topic.
 */
export const useGrammarProgressStore = defineStore('grammarProgress', () => {
    const { value: initial } = repository.load()

    const progress = ref<GrammarTopicProgress[]>(initial)

    function getTopicProgress(topicId: string): GrammarTopicProgress {
        let existing = progress.value.find(item => item.topicId === topicId)

        if (existing) {
            return existing
        }

        const created: GrammarTopicProgress = {
            topicId,
            status: 'new',
            correctAnswers: 0,
            wrongAnswers: 0,
            streak: 0,
            lastPracticedAt: null,
            nextReviewAt: null,
            easeFactor: 2.5,
            intervalDays: 0,
        }

        progress.value.push(created)
        save()

        return created
    }

    /**
     * Record one completed practice session for a topic. `passed` should
     * reflect the session outcome (e.g. >= 70% of exercises correct), not a
     * single exercise — mastery must not flip on one answer.
     */
    function recordSession(
        topicId: string,
        passed: boolean,
        correctCount: number,
        wrongCount: number
    ) {
        const item = getTopicProgress(topicId)

        const schedule = calculateNextReview(toSm2Shape(item), passed)

        item.correctAnswers += correctCount
        item.wrongAnswers += wrongCount
        item.lastPracticedAt = Date.now()
        item.easeFactor = schedule.easeFactor
        item.intervalDays = schedule.intervalDays
        item.nextReviewAt = schedule.nextReviewAt

        if (passed) {
            item.streak++
        } else {
            item.streak = 0
        }

        if (item.streak >= 3) {
            item.status = 'mastered'
        } else if (item.streak >= 1) {
            item.status = 'reviewing'
        } else {
            item.status = 'learning'
        }

        save()
    }

    function getDueTopics(): GrammarTopicProgress[] {
        const now = Date.now()

        return progress.value.filter(
            item =>
                item.status !== 'new' &&
                (item.nextReviewAt === null || item.nextReviewAt <= now)
        )
    }

    function clear() {
        progress.value = []
        save()
    }

    function save() {
        repository.save(progress.value)
    }

    return {
        progress,
        getTopicProgress,
        recordSession,
        getDueTopics,
        clear,
    }
})

/** Adapter: SM-2 engine only reads easeFactor/intervalDays/streak. */
function toSm2Shape(item: GrammarTopicProgress): WordProgress {
    return {
        wordId: item.topicId,
        courseId: '',
        lessonId: '',
        status: item.status,
        level: 0,
        pos: '',
        correctAnswers: item.correctAnswers,
        wrongAnswers: item.wrongAnswers,
        streak: item.streak,
        lastReviewedAt: item.lastPracticedAt,
        nextReviewAt: item.nextReviewAt,
        practicePriority: 0,
        easeFactor: item.easeFactor,
        intervalDays: item.intervalDays,
    }
}

function migrateStored(raw: unknown, _storedVersion: number | null): GrammarTopicProgress[] {
    if (!Array.isArray(raw)) {
        return []
    }

    return raw
        .filter(
            (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).topicId === 'string'
        )
        .map(item => ({
            topicId: String(item.topicId),
            status: isStatus(item.status) ? item.status : 'new',
            correctAnswers: toCount(item.correctAnswers),
            wrongAnswers: toCount(item.wrongAnswers),
            streak: toCount(item.streak),
            lastPracticedAt: toTimestamp(item.lastPracticedAt),
            nextReviewAt: toTimestamp(item.nextReviewAt),
            easeFactor:
                typeof item.easeFactor === 'number' && Number.isFinite(item.easeFactor)
                    ? Math.max(1.3, item.easeFactor)
                    : 2.5,
            intervalDays:
                typeof item.intervalDays === 'number' && Number.isFinite(item.intervalDays)
                    ? Math.max(0, item.intervalDays)
                    : 0,
        }))
}

function isStatus(value: unknown): value is GrammarTopicStatus {
    return value === 'new' || value === 'learning' || value === 'reviewing' || value === 'mastered'
}

function toCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0
}

function toTimestamp(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}
