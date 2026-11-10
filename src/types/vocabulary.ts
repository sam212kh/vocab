export interface Example {
    english: string
    persian: string
}

export interface Word {
    courseId: string
    lessonId: string
    word: string
    meaning: string
    level: string
    pos: string
    synonyms: string[]
    examples: Example[]
    miniContext: string
    icon?: string
}

export type WordStatus =
    | 'new'
    | 'learning'
    | 'reviewing'
    | 'mastered'

export interface WordProgress {
    wordId: string
    courseId: string
    lessonId: string
    status: WordStatus
    level: number
    pos: string
    correctAnswers: number
    wrongAnswers: number
    streak: number
    lastReviewedAt: number | null
    nextReviewAt: number | null
    practicePriority: number
    easeFactor: number
    intervalDays: number
}

export type SkillTag =
    | 'vocabulary'
    | 'grammar'
    | 'listening'
    | 'speaking'
    | 'reading'
    | 'writing'
    | 'pronunciation'

export type DomainTag =
    | 'general'
    | 'business'
    | 'technical'
    | 'academic'
    | 'travel'

/**
 * Optional content metadata, shared by lessons and courses. Every field is
 * optional and additive — existing manifest/lesson JSON keeps working
 * untouched with none of these set. `cefrLevel` is a free-form string
 * (e.g. "A1-A2") rather than a strict CefrLevel union because most existing
 * content only has a reliable range, not a single verified level — do not
 * tighten this without a real basis for the precision.
 */
export interface ContentMetadata {
    cefrLevel?: string
    skillTags?: SkillTag[]
    domainTags?: DomainTag[]
    difficulty?: number
    learningObjectives?: string[]
    estimatedDuration?: number
}

export interface LessonManifest extends ContentMetadata {
    id: string
    title: string
    subtitle?: string
    file: string
    type: 'batch' | 'lesson'
    courseId?: string
    images?: string[]
}

export interface CourseManifest extends ContentMetadata {
    id: string
    title: string
    description?: string
    level?: string
    lessons: LessonManifest[]
}

export interface Manifest {
    version: number
    courses: CourseManifest[]
}
