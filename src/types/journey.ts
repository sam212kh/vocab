import type { Exercise } from './exercise'
import type { SkillName } from './skillProfile'
import type { TransferLearn } from './transfer'
import type { IntegratedUnit } from './integrated'

/**
 * Daily Learning Journey domain types.
 *
 * LEARNING STAGES (tracked separately — a multiple-choice hit is never
 * equivalent to producing a sentence):
 *  recognition — pick/identify the right answer shown to you
 *  recall      — retrieve an answer without seeing it (typed, no options)
 *  production  — construct your own sentence
 *  fluency     — communicate understandably (spoken, or sustained turns)
 */
export type LearningStage = 'recognition' | 'recall' | 'production' | 'fluency'

export const LEARNING_STAGES: LearningStage[] = ['recognition', 'recall', 'production', 'fluency']

export type JourneyLength = 'quick' | 'standard' | 'extended'

export const JOURNEY_LENGTH_MINUTES: Record<JourneyLength, number> = {
    quick: 5,
    standard: 18,
    extended: 40,
}

export type JourneyActivityKind =
    | 'vocab-retrieval'
    | 'recognition-quiz'
    | 'grammar-in-context'
    | 'listening-dictation'
    | 'sentence-construction'
    | 'speaking'
    | 'roleplay'
    | 'career-question'
    | 'spaced-review'
    /** Short introduction of expressions the learner has not been shown yet (exposure only). */
    | 'new-material-intro'
    /** Using a previously acquired pattern in a new situation (transfer). */
    | 'contextual-application'

/** One word/expression to retrieve (typed recall against real SRS). */
export interface RetrievalItem {
    /** The English target (also the SRS word key). */
    english: string
    /** Persian prompt shown to the learner. */
    persian: string
    courseId: string
    lessonId: string
    /** true = due in SRS; false = new/theme item. */
    due: boolean
}

export interface ConstructionPrompt {
    id: string
    /** Persian situation prompt asking for a sentence. */
    promptPersian: string
    promptEnglish: string
    /** Expressions the learner should try to use. */
    targetExpressions: string[]
    /** Model sentences — shown ONLY after the learner submits. */
    modelSentences: string[]
}

export interface IntroItem {
    english: string
    persian: string
    example?: string
    examplePersian?: string
}

export interface JourneyActivity {
    /** Stable within a plan: `${kind}:${sourceId}:${index}`. */
    id: string
    kind: JourneyActivityKind
    /** The learning stage this activity can honestly evidence. */
    stage: LearningStage
    skill: SkillName
    title: string
    estimatedMinutes: number
    /** Why the planner picked this — explainable plans. */
    reason: string
    /** Content id for no-repeat memory (scenario id, exercise id, ...). */
    sourceId: string
    /** Payload — which fields are set depends on kind. */
    retrievalItems?: RetrievalItem[]
    exercises?: Exercise[]
    construction?: ConstructionPrompt
    speakingSentences?: string[]
    /** new-material-intro: what is being introduced. */
    introItems?: IntroItem[]
    /** contextual-application: which pattern / situation this transfer task uses. */
    transfer?: { patternId: string; contextId: string; level: 1 | 2 | 3; anchorExpression: string; matches: string[]; learn?: TransferLearn }
    /** Hand-off target for activities that run in an existing module. */
    route?: { path: string; query?: Record<string, string> }
}

export interface JourneyPlan {
    length: JourneyLength
    /** Plain-language objective for today. */
    objective: string
    /** Coherent daily theme (scenario title) when one was available. */
    theme: { id: string; title: string; titlePersian: string } | null
    activities: JourneyActivity[]
    totalEstimatedMinutes: number
    /** Planner notes: degraded sources, empty content, etc. */
    notes: string[]
    /** Topic-level connections assembled from existing authored manifests. */
    integratedUnit?: IntegratedUnit | null
}

/* ---------- Planner input (snapshot of everything it may read) ---------- */

export interface ThemeCandidate {
    id: string
    title: string
    titlePersian: string
    cefrLevel?: string
    expressions: { english: string; persian: string; example: string; examplePersian?: string }[]
    exercises: Exercise[]
    speakingSentences: string[]
    constructionPrompt: ConstructionPrompt | null
}

/** Evidence-derived facts the adaptive planner may use. All optional: without them the planner behaves as before. */
export interface PlannerEvidence {
    /** Normalized lexical keys (lowercase text) the learner has been shown or has attempted. */
    introduced: string[]
    /** Highest evidence stage per normalized key; absent / null = no evidence. */
    stages: Record<string, 'exposed' | 'recognized' | 'recalled' | 'produced' | 'applied' | 'retained' | null>
    /** Normalized keys whose delayed-retention check is due or missed, most urgent first. */
    retentionDue: string[]
    /** Skill-gap classification per dimension (only 'weakness' changes the plan). */
    gaps: { dimension: string; classification: 'strength' | 'developing' | 'weakness' | 'insufficient'; estimate: number | null; why: string }[]
    /** Ready-made transfer task, or why none exists. */
    transfer: {
        task: {
            patternId: string
            contextId: string
            level: 1 | 2 | 3
            patternTitle: string
            anchorExpression: string
            /** Pattern regexes for the basic (non-AI) check; absent = target phrases only. */
            matches?: string[]
            learn?: TransferLearn
            prompt: ConstructionPrompt
        } | null
        reason: 'no-content' | 'no-acquired-expression' | 'all-contexts-done' | null
    }
}

export interface PlannerInput {
    /** Evidence ledger summaries. Present → adaptive rules apply. */
    evidence?: PlannerEvidence
    length: JourneyLength
    /** Words due for SRS review RIGHT NOW (from wordProgress.getDueWords + loaded Word data). */
    dueWords: RetrievalItem[]
    /** New (never studied) vocabulary candidates, in stable order. */
    newWords: RetrievalItem[]
    dueGrammarTopics: string[]
    /** Grammar exercises available for in-context practice, by topic. */
    grammarExercises: { topicId: string; exercise: Exercise }[]
    /** Real-Life scenarios (optional source). */
    themes: ThemeCandidate[]
    /** Listening dictation exercises (optional). */
    dictationExercises: Exercise[]
    careerQuestions: { id: string; question: string }[]
    recurringMistakeCategories: string[]
    /** Per-skill observed accuracy summaries; may be empty. */
    weakSkills: SkillName[]
    /** Source ids completed in recent journeys (no-repeat memory). */
    recentlyCompleted: string[]
    /** Learner's speaking preference — voice activities are skipped when off. */
    speakingEnabled: boolean
    /** Stage mastery so far, to balance recognition vs production. */
    stageCounts: Record<LearningStage, number>
    /** Optional cross-skill map; absent for older callers and tests. */
    integratedUnits?: IntegratedUnit[]
}

/* ---------- Session lifecycle + evidence ---------- */

export type JourneyActivityStatus = 'pending' | 'completed' | 'skipped'

/**
 * How a production answer came about — only 'none' is independent production.
 *  none              first attempt, no hint, no correction shown
 *  hint              a hint was shown before the answer
 *  after-feedback    a retry after seeing feedback (correction not copied)
 *  copied-correction retry that reproduces the correction the learner was shown
 */
export type ProductionAssistance = 'none' | 'hint' | 'after-feedback' | 'copied-correction'

export interface JourneyEvidenceRecord {
    id: string
    sessionId: string
    activityId: string
    kind: JourneyActivityKind
    stage: LearningStage
    skill: SkillName
    /** The expression/exercise this evidence is about (for "recalled independently" counts). */
    itemKey: string
    correct: boolean
    /** True when the answer was produced with no options/hints shown. */
    independent: boolean
    hintsUsed: number
    /** How the learner answered — only 'voice' may evidence Speaking. */
    modality: 'typed' | 'voice' | 'selected'
    /** Rough completeness 0-1 for productive answers (null otherwise). */
    completeness: number | null
    timestamp: number
    /** Production only. Absent on older records (treated as deterministic / unassisted). */
    evaluator?: 'ai' | 'deterministic'
    assistance?: ProductionAssistance
    /** 1 = first attempt at this prompt. */
    attempt?: number
    /** AI outcome label (e.g. 'needs-correction'); never a score or level. */
    outcome?: string
    /** AI-detected issue kinds, used only to tag error categories on first attempts. */
    issues?: string[]
    /** Set for contextual-application (transfer) answers. */
    transfer?: { patternId: string; contextId: string; level: number }
}

export interface JourneySession {
    id: string
    plan: JourneyPlan
    statuses: Record<string, JourneyActivityStatus>
    currentIndex: number
    startedAt: number
    completedAt: number | null
    /** Evidence ids generated in this session. */
    evidenceIds: string[]
}

export interface JourneySummary {
    activitiesCompleted: number
    activitiesTotal: number
    expressionsEncountered: number
    expressionsRecalledIndependently: number
    productiveAttempts: number
    /** Honest split of sentence production — only "independent" shows unaided production. */
    production: {
        independent: number
        hintAssisted: number
        afterFeedback: number
        copiedCorrection: number
        aiEvaluated: number
        basicCheckOnly: number
    }
    skillsPracticed: SkillName[]
    stageBreakdown: Record<LearningStage, { attempts: number; correct: number }>
    mistakesWorthReviewing: string[]
    effortScore: number
    nextSuggestion: string
}

/* ---------- Roadmap ---------- */

export type RoadmapStageId =
    | 'everyday-foundations'
    | 'daily-communication'
    | 'natural-conversations'
    | 'social-english'
    | 'professional-communication'
    | 'career-interviews'
    | 'advanced-fluency'

export interface RoadmapStageStatus {
    id: RoadmapStageId
    title: string
    description: string
    state: 'locked' | 'available' | 'in-progress' | 'completed' | 'content-pending'
    /** Evidence progress 0-1 toward completion. */
    progress: number
    /** Plain explanation of what unlocks/completes this stage. */
    requirement: string
    /** Structured thresholds for localized rendering; derived from the same roadmap definition. */
    thresholds?: { recall: number; production: number; journeys: number; fluency: number }
}
