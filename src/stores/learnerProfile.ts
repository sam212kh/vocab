import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { useToastStore } from './toast'
import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'

import {
    createDefaultLearnerProfile,
} from '../types/learnerProfile'

import type {
    ExplanationLanguage,
    LearnerProfile,
    LearningGoal,
    LearningGoalType,
    StudyDay,
    StudyDurationMinutes,
} from '../types/learnerProfile'

const STORAGE_KEY = 'english-upgrade-learner-profile'

const STORAGE_VERSION = 1

const VALID_DURATIONS: StudyDurationMinutes[] = [15, 30, 45, 60]

const VALID_STUDY_DAYS: StudyDay[] = [
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
]

const VALID_GOAL_TYPES: LearningGoalType[] = [
    'speaking',
    'listening',
    'reading',
    'writing',
    'vocabulary',
    'grammar',
    'professional-english',
    'travel-english',
    'exam-preparation',
]

const VALID_EXPLANATION_LANGUAGES: ExplanationLanguage[] = [
    'persian', 'english', 'bilingual',
]

const repository = createVersionedRepository<LearnerProfile>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => createDefaultLearnerProfile(),
    migrate: migrateStoredProfile,
})

export const useLearnerProfileStore = defineStore(
    'learnerProfile',
    () => {
        const { value: initialProfile } = repository.load()

        const profile = ref<LearnerProfile>(initialProfile)

        function update(patch: Partial<Omit<LearnerProfile, 'createdAt'>>) {
            profile.value = {
                ...profile.value,
                ...patch,
                updatedAt: Date.now(),
            }

            save()

            useToastStore().push('Profile saved.', 'success')
        }

        function resetToDefaults() {
            profile.value = createDefaultLearnerProfile()

            save()

            useToastStore().push('Profile reset to defaults.', 'info')
        }

        function save() {
            repository.save(profile.value)
        }

        return {
            profile,
            update,
            resetToDefaults,
        }
    }
)

function migrateStoredProfile(
    raw: unknown,
    _storedVersion: number | null
): LearnerProfile {
    const fallback = createDefaultLearnerProfile()

    if (!raw || typeof raw !== 'object') {
        return fallback
    }

    const value = raw as Partial<LearnerProfile>

    return {
        nativeLanguage:
            typeof value.nativeLanguage === 'string' && value.nativeLanguage.trim()
                ? value.nativeLanguage
                : fallback.nativeLanguage,

        targetLanguage:
            typeof value.targetLanguage === 'string' && value.targetLanguage.trim()
                ? value.targetLanguage
                : fallback.targetLanguage,

        goals: sanitizeGoals(value.goals) ?? fallback.goals,

        studyDurationMinutes:
            VALID_DURATIONS.includes(value.studyDurationMinutes as StudyDurationMinutes)
                ? (value.studyDurationMinutes as StudyDurationMinutes)
                : fallback.studyDurationMinutes,

        studyDays: sanitizeStudyDays(value.studyDays) ?? fallback.studyDays,

        interests: Array.isArray(value.interests)
            ? value.interests.filter((item): item is string => typeof item === 'string')
            : fallback.interests,

        explanationLanguage:
            VALID_EXPLANATION_LANGUAGES.includes(value.explanationLanguage as ExplanationLanguage)
                ? (value.explanationLanguage as ExplanationLanguage)
                : fallback.explanationLanguage,

        selfReportedLevel: isCefrLevel(value.selfReportedLevel)
            ? value.selfReportedLevel
            : (value.selfReportedLevel === null ? null : fallback.selfReportedLevel),

        selectedProgramId:
            typeof value.selectedProgramId === 'string' ? value.selectedProgramId : null,

        createdAt:
            typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
                ? value.createdAt
                : fallback.createdAt,

        updatedAt:
            typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
                ? value.updatedAt
                : fallback.updatedAt,
    }
}

function isCefrLevel(value: unknown): value is CefrLevel {
    return typeof value === 'string' && CEFR_LEVELS.includes(value as CefrLevel)
}

function sanitizeGoals(value: unknown): LearningGoal[] | null {
    if (!Array.isArray(value)) {
        return null
    }

    const goals = value
        .filter(
            (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object'
        )
        .filter(item => VALID_GOAL_TYPES.includes(item.type as LearningGoalType))
        .map((item, index) => ({
            type: item.type as LearningGoalType,
            priority:
                typeof item.priority === 'number' && Number.isFinite(item.priority)
                    ? item.priority
                    : index + 1,
        }))

    return goals.length ? goals : null
}

function sanitizeStudyDays(value: unknown): StudyDay[] | null {
    if (!Array.isArray(value)) {
        return null
    }

    const days = value.filter((item): item is StudyDay =>
        VALID_STUDY_DAYS.includes(item as StudyDay)
    )

    return days.length ? days : null
}
