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
}

export interface LessonManifest {
    id: string
    title: string
    subtitle?: string
    file: string
    type: 'batch' | 'lesson'
    courseId?: string
}

export interface CourseManifest {
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
