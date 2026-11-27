export type SectionMode = 'overview' | 'learn' | 'practice' | 'career'

/**
 * Which section identity a route belongs to. Drives the page surface and the
 * accent (data-mode in App.vue) and the sidebar grouping, so a screen never
 * has to decide its own colours.
 */
const PRACTICE_PATHS = [
    '/practice', '/meaning-recall', '/session', '/quiz', '/cloze', '/matching', '/listening', '/listen-guess',
    '/listen-repeat', '/grammar', '/reading', '/hard-words', '/review', '/speaking-practice',
    '/guided-speaking', '/writing', '/conversation', '/placement',
]

const LEARN_PATHS = ['/lessons', '/courses', '/real-life', '/learn', '/learning-path']

function startsWithPath(path: string, base: string): boolean {
    return path === base || path.startsWith(`${base}/`)
}

export function modeForPath(path: string): SectionMode {
    if (startsWithPath(path, '/career-english')) return 'career'
    if (PRACTICE_PATHS.some(base => startsWithPath(path, base))) return 'practice'
    if (LEARN_PATHS.some(base => startsWithPath(path, base))) return 'learn'

    return 'overview'
}
