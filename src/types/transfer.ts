export interface TransferContext {
    id: string
    /** 1 = nearby situation, 2 = different domain, 3 = the learner's own real life. */
    level: 1 | 2 | 3
    situation: string
    situationPersian: string
    /** What to achieve in this situation — never a sentence with a blank. */
    goal: string
    goalPersian: string
    /** Phrases that count as using the pattern (used only to mark the target, never as the only valid answer). */
    targetPhrases: string[]
    /** Examples of valid answers — not the only valid answers. */
    references: string[]
    /** Learner-authored content about their own life (evaluated like any open sentence). */
    open?: boolean
    /** Shown after the learner answers: why this wording works in this situation. */
    feedback?: string
    feedbackPersian?: string
}

export interface TransferPattern {
    id: string
    title: string
    titlePersian: string
    frame: string
    /** Regular expressions (case-insensitive) that identify learned expressions built on this pattern. */
    matches: string[]
    contexts: TransferContext[]
    /** Author-assigned level of the language pattern (not an external CEFR rating). */
    cefrLevel?: string
    /** What the pattern is and when to use it. */
    explanation?: string
    explanationPersian?: string
    /** A natural example sentence using the pattern. */
    example?: string
    examplePersian?: string
}

export interface TransferManifest {
    version: number
    patterns: TransferPattern[]
}

/** One recorded transfer attempt (derived from the evidence ledger). */
export interface TransferAttempt {
    patternId: string
    contextId: string
    ok: boolean
    independent: boolean
    verified: boolean
    t: number
}

export interface TransferTask {
    patternId: string
    contextId: string
    level: 1 | 2 | 3
    patternTitle: string
    patternTitlePersian: string
    /** The learned expression that makes this pattern "previously acquired". */
    anchorExpression: string
    /** The pattern's recognition regexes (used by the basic, non-AI check). */
    matches: string[]
    open: boolean
    /** Teaching notes shown after the answer. */
    learn?: TransferLearn
    prompt: {
        id: string
        promptEnglish: string
        promptPersian: string
        targetExpressions: string[]
        modelSentences: string[]
    }
}

export interface TransferLearn {
    frame: string
    explanation?: string
    explanationPersian?: string
    example?: string
    examplePersian?: string
    feedback?: string
    feedbackPersian?: string
}

export interface LearnedExpression {
    key: string
    text: string
    /** Evidence ladder stage of the learner for this expression. */
    stage: 'exposed' | 'recognized' | 'recalled' | 'produced' | 'applied' | 'retained' | null
}
