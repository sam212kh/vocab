import type {
    CourseManifest,
    Example,
    LessonManifest,
    Manifest,
    SynonymSense,
    Word,
} from '../types/vocabulary'

interface RawWord {
    word?: unknown
    meaning?: unknown
    level?: unknown
    pos?: unknown
    synonyms?: unknown
    clozeVariants?: unknown
    examples?: unknown
    miniContext?: unknown
    icon?: unknown
}

// Bump `public/data/manifest.json` version whenever published content changes.
// Lesson JSON is static and otherwise can remain cached by a production CDN.
let contentVersion = '1'

/**
 * Previously both fetches below forced `cache: 'no-store'` and were called
 * fresh by every view's `onMounted` with no memoization — so navigating
 * between any two of Practice/Cloze/Listen & Repeat/Hard Words/etc. re-fetched
 * the whole manifest (116KB raw) and re-fetched every lesson file again, even
 * for content that cannot have changed within the session. That's the root
 * cause behind "the app feels slow everywhere" and Hard Words Practice/Repeat
 * Mode re-scanning every lesson on every single visit. In-memory, per-session
 * caching here (the versioned `?v=` query string already invalidates it
 * correctly when content changes) fixes both at once without adding a second
 * data store.
 */
let manifestPromise: Promise<Manifest> | null = null
const lessonCache = new Map<string, Promise<Word[]>>()

/** Clears the in-memory manifest/lesson cache. Exposed for tests that need each case to hit a fresh fetch mock. */
export function clearVocabularyCache(): void {
    manifestPromise = null
    lessonCache.clear()
}

function normalizeExample(value: unknown): Example {
    if (Array.isArray(value)) {
        return {
            english: String(value[0] ?? ''),
            persian: String(value[1] ?? ''),
        }
    }

    if (value && typeof value === 'object') {
        const item = value as Record<string, unknown>

        return {
            english: String(item.english ?? ''),
            persian: String(item.persian ?? ''),
        }
    }

    return {
        english: '',
        persian: '',
    }
}

/**
 * Root cause of the "missing second meaning" bug: this used to return only
 * `value[0]`, silently discarding each synonym's Persian gloss (`value[1]`)
 * — real data the content authors provided, dropped at the parser before
 * anything downstream ever saw it.
 */
function normalizeSynonym(value: unknown): SynonymSense {
    if (Array.isArray(value)) {
        return {
            word: String(value[0] ?? '').trim(),
            meaning: String(value[1] ?? '').trim(),
        }
    }

    return { word: String(value ?? '').trim(), meaning: '' }
}

function normalizeWord(
    raw: RawWord,
    lesson: LessonManifest
): Word {
    const examples = Array.isArray(raw.examples)
        ? raw.examples
            .map(normalizeExample)
            .filter(item => item.english || item.persian)
        : []

    const synonyms = Array.isArray(raw.synonyms)
        ? raw.synonyms
            .map(normalizeSynonym)
            .filter(entry => entry.word)
        : []

    const clozeVariants = Array.isArray(raw.clozeVariants)
        ? raw.clozeVariants
            .map(value => String(value ?? '').trim())
            .filter(Boolean)
        : []

    return {
        courseId: lesson.courseId ?? '',
        lessonId: lesson.id,
        word: String(raw.word ?? '').trim(),
        meaning: String(raw.meaning ?? '').trim(),
        level: String(raw.level ?? '').trim(),
        pos: String(raw.pos ?? '').trim(),
        synonyms,
        clozeVariants,
        examples,
        miniContext: String(raw.miniContext ?? '').trim(),
        icon: typeof raw.icon === 'string' && raw.icon
            ? raw.icon
            : undefined,
    }
}

async function fetchManifest(): Promise<Manifest> {
    const response = await fetch('/data/manifest.json')

    if (!response.ok) {
        throw new Error(
            `Could not load manifest (${response.status})`
        )
    }

    const manifest =
        (await response.json()) as Manifest

    contentVersion = String(manifest.version ?? '1')

    if (
        !manifest ||
        !Array.isArray(manifest.courses)
    ) {
        throw new Error('Invalid manifest format')
    }

    const courses: CourseManifest[] =
        manifest.courses.map(course => ({
            ...course,
            lessons: course.lessons.map(
                lesson => ({
                    ...lesson,
                    courseId: course.id,
                })
            ),
        }))

    return {
        ...manifest,
        courses,
    }
}

export function loadManifest(): Promise<Manifest> {
    if (!manifestPromise) {
        manifestPromise = fetchManifest().catch(error => {
            manifestPromise = null
            throw error
        })
    }

    return manifestPromise
}

async function fetchLesson(
    lesson: LessonManifest,
    url: string
): Promise<Word[]> {
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(
            `Failed to load ${lesson.id} (${response.status})`
        )
    }

    const raw =
        (await response.json()) as unknown

    if (!Array.isArray(raw)) {
        throw new Error(
            `Invalid lesson format: ${lesson.id}`
        )
    }

    return raw
        .map(item =>
            normalizeWord(
                item as RawWord,
                lesson
            )
        )
        .filter(item => item.word)
}

export function loadLesson(
    lesson: LessonManifest
): Promise<Word[]> {
    const file = lesson.file
        .replace(/^\.\//, '')
        .replace(/^\//, '')

    const url = `/data/${file}?v=${encodeURIComponent(contentVersion)}`

    const cached = lessonCache.get(url)
    if (cached) return cached

    const pending = fetchLesson(lesson, url).catch(error => {
        lessonCache.delete(url)
        throw error
    })

    lessonCache.set(url, pending)
    return pending
}
