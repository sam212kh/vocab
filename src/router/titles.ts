const TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    'daily-journey': 'Daily Journey',
    session: 'Review Due Words',
    lessons: 'Courses',
    course: 'Course',
    lesson: 'Lesson',
    practice: 'Practice',
    'meaning-recall': 'Meaning Recall',
    quiz: 'Quiz',
    cloze: 'Cloze',
    matching: 'Matching',
    'listen-guess': 'Listen & Guess',
    'listen-repeat': 'Listen & Repeat',
    'hard-words': 'Hard Words',
    'speaking-practice': 'Speaking Practice',
    review: 'Review',
    profile: 'Profile',
    skills: 'Skill Levels',
    progress: 'Learning Progress',
    grammar: 'Grammar',
    reading: 'Reading',
    writing: 'Writing',
    listening: 'Listening',
    'guided-speaking': 'Guided Speaking',
    'ai-settings': 'AI Settings',
    conversation: 'Conversation',
    coach: 'AI Coach',
    immersive: 'Immersive Scenarios',
    'real-life': 'Real-Life English',
    'career-english': 'Career English',
    onboarding: 'Welcome',
    placement: 'Placement Test',
    'learning-path': 'Learning Path',
    'not-found': 'Page not found',
}

export const APP_NAME = 'English Upgrade'

/** Document title for a route name — screen readers and browser history rely on it. */
export function titleForRoute(name: unknown): string {
    const title = typeof name === 'string' ? TITLES[name] : undefined

    return title ? `${title} · ${APP_NAME}` : APP_NAME
}
