import { ref } from 'vue'
import { defineStore } from 'pinia'

import { createVersionedRepository } from '../persistence/versionedStorage'
import { useToastStore } from './toast'
import { CEFR_LEVELS } from '../types/cefr'
import type { CefrLevel } from '../types/cefr'

import {
    SKILL_NAMES,
    createDefaultSkillProfile,
} from '../types/skillProfile'

import type {
    ProficiencySource,
    SkillName,
    SkillProfile,
    SkillState,
} from '../types/skillProfile'

const STORAGE_KEY = 'english-upgrade-skill-profile'

const STORAGE_VERSION = 1

const SELF_REPORTED_CONFIDENCE = 0.3

const repository = createVersionedRepository<SkillProfile>({
    key: STORAGE_KEY,
    version: STORAGE_VERSION,
    defaultValue: () => createDefaultSkillProfile(),
    migrate: migrateStoredSkillProfile,
})

export const useSkillProfileStore = defineStore(
    'skillProfile',
    () => {
        const { value: initialProfile } = repository.load()

        const profile = ref<SkillProfile>(initialProfile)

        /**
         * The learner's own guess for one skill. Always recorded as
         * self-reported / low confidence — never promoted to "observed" or
         * "verified" automatically. Skills are independent: calling this for
         * "speaking" has no effect on any other skill's level.
         */
        function selfReportLevel(skill: SkillName, level: CefrLevel) {
            recordEstimate(skill, level, 'self-reported', SELF_REPORTED_CONFIDENCE)

            useToastStore().push(`${skill} updated to ${level} (self-reported).`, 'success')
        }

        /**
         * Reserved for future adaptive-learning phases: record a level
         * inferred from observed exercise performance across multiple
         * activities (not a single answer). Not called anywhere yet since
         * no module currently produces this signal — exists so Phase 6+
         * (error tracking / adaptive difficulty) has a real entry point
         * instead of needing a model change later.
         */
        function recordObserved(
            skill: SkillName,
            level: CefrLevel,
            confidence: number,
            notes?: string
        ) {
            recordEstimate(skill, level, 'observed', confidence, notes)
        }

        /**
         * Reserved for a future real assessment/placement module.
         */
        function recordVerified(
            skill: SkillName,
            level: CefrLevel,
            confidence: number,
            notes?: string
        ) {
            recordEstimate(skill, level, 'verified', confidence, notes)
        }

        function recordEstimate(
            skill: SkillName,
            level: CefrLevel,
            source: ProficiencySource,
            confidence: number,
            notes?: string
        ) {
            const now = Date.now()

            const state = profile.value.skills[skill]

            const nextState: SkillState = {
                ...state,
                current: { level, source, confidence, recordedAt: now },
                history: [
                    ...state.history,
                    { skill, level, source, confidence, recordedAt: now, notes },
                ],
            }

            profile.value = {
                ...profile.value,
                skills: { ...profile.value.skills, [skill]: nextState },
                updatedAt: now,
            }

            save()
        }

        function setStrengthsAndWeaknesses(
            skill: SkillName,
            strengths: string[],
            weaknesses: string[]
        ) {
            const state = profile.value.skills[skill]

            profile.value = {
                ...profile.value,
                skills: {
                    ...profile.value.skills,
                    [skill]: { ...state, strengths, weaknesses },
                },
                updatedAt: Date.now(),
            }

            save()
        }

        function clear() {
            profile.value = createDefaultSkillProfile()
            save()
        }

        function save() {
            repository.save(profile.value)
        }

        return {
            profile,
            selfReportLevel,
            recordObserved,
            recordVerified,
            setStrengthsAndWeaknesses,
            clear,
        }
    }
)

function migrateStoredSkillProfile(
    raw: unknown,
    _storedVersion: number | null
): SkillProfile {
    const fallback = createDefaultSkillProfile()

    if (!raw || typeof raw !== 'object') {
        return fallback
    }

    const value = raw as Partial<SkillProfile>

    if (!value.skills || typeof value.skills !== 'object') {
        return fallback
    }

    const skills = { ...fallback.skills }

    for (const skill of SKILL_NAMES) {
        const stored = (value.skills as Record<string, unknown>)[skill]

        const sanitized = sanitizeSkillState(skill, stored)

        if (sanitized) {
            skills[skill] = sanitized
        }
    }

    return {
        skills,
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

function sanitizeSkillState(skill: SkillName, raw: unknown): SkillState | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }

    const value = raw as Partial<SkillState>

    return {
        skill,
        current: sanitizeEstimate(value.current),
        history: Array.isArray(value.history)
            ? value.history
                .map(sanitizeAssessmentResult(skill))
                .filter((item): item is SkillState['history'][number] => item !== null)
            : [],
        strengths: Array.isArray(value.strengths)
            ? value.strengths.filter((item): item is string => typeof item === 'string')
            : [],
        weaknesses: Array.isArray(value.weaknesses)
            ? value.weaknesses.filter((item): item is string => typeof item === 'string')
            : [],
    }
}

function sanitizeEstimate(raw: unknown): SkillState['current'] {
    if (!raw || typeof raw !== 'object') {
        return null
    }

    const value = raw as Record<string, unknown>

    if (!isCefrLevel(value.level) || !isProficiencySource(value.source)) {
        return null
    }

    return {
        level: value.level,
        source: value.source,
        confidence: typeof value.confidence === 'number' ? value.confidence : SELF_REPORTED_CONFIDENCE,
        recordedAt: typeof value.recordedAt === 'number' ? value.recordedAt : Date.now(),
    }
}

function sanitizeAssessmentResult(skill: SkillName) {
    return (raw: unknown): SkillState['history'][number] | null => {
        if (!raw || typeof raw !== 'object') {
            return null
        }

        const value = raw as Record<string, unknown>

        if (!isCefrLevel(value.level) || !isProficiencySource(value.source)) {
            return null
        }

        return {
            skill,
            level: value.level,
            source: value.source,
            confidence: typeof value.confidence === 'number' ? value.confidence : SELF_REPORTED_CONFIDENCE,
            recordedAt: typeof value.recordedAt === 'number' ? value.recordedAt : Date.now(),
            notes: typeof value.notes === 'string' ? value.notes : undefined,
        }
    }
}

function isCefrLevel(value: unknown): value is CefrLevel {
    return typeof value === 'string' && CEFR_LEVELS.includes(value as CefrLevel)
}

function isProficiencySource(value: unknown): value is ProficiencySource {
    return value === 'self-reported' || value === 'observed' || value === 'verified'
}
