import type { ReadingPassageManifest } from '../types/reading'
import type { ReadingComprehensionExercise } from '../types/exercise'

export type ReadingStrategy =
    | 'skimming'
    | 'scanning'
    | 'contextual-vocabulary'
    | 'detail'
    | 'inference'
    | 'author-purpose'

export interface ReadingLessonPlan {
    passageId: string
    level: string
    strategy: ReadingStrategy
    objectiveIds: string[]
    stages: ('objective' | 'prepare' | 'strategy' | 'read' | 'guided' | 'independent' | 'transfer' | 'review')[]
}

/** Derives a progressive lesson contract from authored objectives/exercises. */
export function buildReadingLessonPlan(
    manifest: ReadingPassageManifest,
    exercises: Pick<ReadingComprehensionExercise, 'comprehensionKind'>[],
): ReadingLessonPlan {
    const kinds = new Set(exercises.map(exercise => exercise.comprehensionKind).filter(Boolean))
    const strategy: ReadingStrategy =
        kinds.has('vocabulary-in-context') ? 'contextual-vocabulary'
            : kinds.has('inference') ? 'inference'
                : kinds.has('main-idea') ? 'skimming'
                    : kinds.has('specific-information') ? 'scanning'
                        : manifest.kind === 'article' || manifest.kind === 'professional' ? 'author-purpose'
                            : 'detail'

    return {
        passageId: manifest.id,
        level: manifest.cefrLevel ?? 'Unlevelled',
        strategy,
        objectiveIds: (manifest.learningObjectives ?? []).map(objective =>
            typeof objective === 'string' ? objective : objective.id,
        ),
        stages: ['objective', 'prepare', 'strategy', 'read', 'guided', 'independent', 'transfer', 'review'],
    }
}
