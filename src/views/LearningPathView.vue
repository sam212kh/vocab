<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '../components/ui/PageHeader.vue'
import RoadmapTimeline from '../components/journey/RoadmapTimeline.vue'
import { buildRoadmap, currentRoadmapStage } from '../services/roadmap'
import { loadManifest } from '../services/vocabulary'
import type { CourseManifest } from '../types/vocabulary'
import { useJourneyStore } from '../stores/journey'
import { useSkillProfileStore } from '../stores/skillProfile'
import { PLACEMENT_SKILLS } from '../services/placementSummary'
import { useLocale } from '../services/locale'

const router = useRouter()
const journeyStore = useJourneyStore()
const skillProfileStore = useSkillProfileStore()
const { t } = useLocale()

const courses = ref<CourseManifest[]>([])

onMounted(async () => {
    try {
        courses.value = (await loadManifest()).courses
    } catch {
        courses.value = []
    }
})

/*
 * Same availableSources set journeyContent.ts actually produces today
 * (vocabulary, grammar, real-life, career, conversation) — 'advanced-content'
 * is never added anywhere in the codebase, so the final roadmap stage is
 * genuinely, permanently content-pending right now. See
 * docs/PHASE11_CURRICULUM_MAP.md §1 for why this isn't faked here.
 */
const roadmap = computed(() =>
    buildRoadmap({
        evidence: journeyStore.evidence,
        completedJourneys: journeyStore.completedJourneyCount,
        availableSources: ['vocabulary', 'grammar', 'real-life', 'career', 'conversation'],
    })
)

const currentStage = computed(() => currentRoadmapStage(roadmap.value))

/*
 * Read-only CEFR view built directly from the real manifests' own cefrLevel
 * fields — not a new content model. Vocabulary courses outside Oxford carry
 * no CEFR tag at all, so they're intentionally left out of this table
 * rather than guessed at (docs/PHASE11_CURRICULUM_MAP.md §2).
 */
const CEFR_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

const oxfordCourses = computed(() => courses.value.filter(course => course.id.startsWith('oxford-')))
const guidedCourse = computed(() => courses.value.find(course => course.id === 'oxford-elementary') ?? courses.value[0] ?? null)

function bandsOf(label: string | undefined): string[] {
    if (!label) return []
    const indexes = label.split('-').map(part => CEFR_BANDS.indexOf(part.trim().toUpperCase() as typeof CEFR_BANDS[number]))
    if (indexes.some(index => index < 0)) return []
    return CEFR_BANDS.slice(Math.min(...indexes), Math.max(...indexes) + 1)
}
</script>

<template>
    <div class="mx-auto max-w-3xl space-y-8">
        <PageHeader
            :eyebrow="t('roadmap.eyebrow')"
            :title="t('roadmap.title')"
            :description="t('roadmap.description')"
            serif
        >
            <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-primary" @click="router.push(guidedCourse ? `/courses/${guidedCourse.id}/lessons/${guidedCourse.lessons[0]?.id}` : '/lessons')">{{ t('roadmap.continueLearning') }}</button>
                <button type="button" class="btn-secondary" @click="router.push('/daily-journey')">{{ t('roadmap.startJourney') }}</button>
            </div>
        </PageHeader>

        <section :aria-label="t('roadmap.thematic')">
            <RoadmapTimeline :roadmap="roadmap" :current-stage="currentStage" />
        </section>

        <section v-if="guidedCourse" class="surface p-5 sm:p-6" :aria-label="t('roadmap.guidedCurriculum')">
            <p class="label">{{ t('roadmap.guidedCurriculum') }}</p>
            <h2 class="mt-1 text-lg font-semibold text-gray-900">{{ guidedCourse.title }}</h2>
            <p class="mt-1 text-sm text-gray-500">{{ t('roadmap.guidedDescription') }}</p>
            <RouterLink :to="`/courses/${guidedCourse.id}`" class="btn-secondary mt-4">{{ t('roadmap.openLessons') }}</RouterLink>
        </section>

        <section class="surface p-5 sm:p-6" :aria-label="t('roadmap.cefrView')">
            <h2 class="text-lg font-semibold text-gray-900">{{ t('roadmap.cefrView') }}</h2>
            <p class="mt-1 text-sm text-gray-500">
                {{ t('roadmap.cefrDescription') }}
            </p>

            <div class="mt-4 space-y-3">
                <div v-for="course in oxfordCourses" :key="course.id" class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                    <div class="min-w-0 flex-1">
                        <p class="truncate font-medium text-gray-900">{{ course.title }}</p>
                        <p class="text-xs text-gray-400">{{ t('roadmap.lessons', { count: String(course.lessons.length) }) }}</p>
                    </div>
                    <div class="flex shrink-0 gap-1">
                        <span
                            v-for="band in CEFR_BANDS"
                            :key="band"
                            class="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                            :class="bandsOf(course.cefrLevel).includes(band) ? 'bg-accent text-white' : 'bg-gray-100 text-gray-300'"
                        >{{ band }}</span>
                    </div>
                </div>
            </div>

            <div class="mt-4 border-t border-gray-100 pt-4">
                <p class="label">{{ t('roadmap.verifiedLevels') }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                    <span v-for="skill in PLACEMENT_SKILLS" :key="skill" class="chip" aria-pressed="true">
                        {{ t(`roadmap.skill.${skill}`) }}: {{ skillProfileStore.profile.skills[skill].current?.level ?? t('roadmap.notAssessed') }}
                    </span>
                </div>
                <button
                    v-if="!PLACEMENT_SKILLS.some(skill => skillProfileStore.profile.skills[skill].current?.source === 'verified')"
                    type="button"
                    class="btn-secondary mt-3"
                    @click="router.push('/placement')"
                >
                    {{ t('roadmap.placement') }}
                </button>
            </div>
        </section>
    </div>
</template>
