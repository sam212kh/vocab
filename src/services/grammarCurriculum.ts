import type { GrammarManifest, GrammarTopicManifest } from '../types/grammar'

export type GrammarLessonStage =
    | 'meaning'
    | 'usage'
    | 'pattern'
    | 'examples'
    | 'guided'
    | 'independent'
    | 'transfer'
    | 'review'

export interface GrammarCurriculumEntry {
    topicId: string
    sequence: number
    level: string
    unit: string
    prerequisiteIds: string[]
    objectiveIds: string[]
    stages: GrammarLessonStage[]
}

/**
 * Builds the grammar path from the content manifest. The manifest remains the
 * source of truth: this service adds navigation metadata, not new grammar
 * claims or a second progress database.
 */
export function buildGrammarCurriculum(manifest: GrammarManifest): GrammarCurriculumEntry[] {
    const ordered = orderTopics(manifest.topics)

    return ordered.map((topic, index) => ({
        topicId: topic.id,
        sequence: index + 1,
        level: topic.cefrLevel ?? 'Unlevelled',
        unit: topic.category ?? 'Grammar foundations',
        prerequisiteIds: index === 0 ? [] : [ordered[index - 1].id],
        objectiveIds: (topic.learningObjectives ?? []).map(objective =>
            typeof objective === 'string' ? objective : objective.id,
        ),
        stages: ['meaning', 'usage', 'pattern', 'examples', 'guided', 'independent', 'transfer', 'review'],
    }))
}

/** Keep existing content order within each level, but teach foundational topics first. */
function orderTopics(topics: GrammarTopicManifest[]): GrammarTopicManifest[] {
    const preferred = [
        'be-and-questions',
        'present-simple',
        'articles',
        'past-simple',
        'comparatives-superlatives',
        'modal-verbs-requests-advice',
        'future-forms',
        'present-perfect',
        'first-conditional',
        'used-to-and-past-habits',
        'second-conditional',
        'passive-voice',
        'advanced-sentence-patterns',
    ]
    const rank = new Map(preferred.map((id, index) => [id, index]))

    return [...topics].sort((left, right) =>
        (rank.get(left.id) ?? preferred.length) - (rank.get(right.id) ?? preferred.length),
    )
}

export function curriculumEntry(
    curriculum: GrammarCurriculumEntry[],
    topicId: string,
): GrammarCurriculumEntry | undefined {
    return curriculum.find(entry => entry.topicId === topicId)
}

export function exerciseStage(type: string): 'guided' | 'independent' | 'transfer' {
    if (type === 'multiple-choice' || type === 'matching' || type === 'sentence-ordering') return 'guided'
    if (type === 'translation' || type === 'short-answer' || type === 'grammar-correction') return 'independent'
    return 'transfer'
}
