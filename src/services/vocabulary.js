function normalizeExample(value) {
    if (Array.isArray(value)) {
        return {
            english: String(value[0] ?? ''),
            persian: String(value[1] ?? ''),
        };
    }
    if (value && typeof value === 'object') {
        const item = value;
        return {
            english: String(item.english ?? ''),
            persian: String(item.persian ?? ''),
        };
    }
    return {
        english: '',
        persian: '',
    };
}
function normalizeSynonym(value) {
    if (Array.isArray(value)) {
        return String(value[0] ?? '').trim();
    }
    return String(value ?? '').trim();
}
function normalizeWord(raw, lesson) {
    const examples = Array.isArray(raw.examples)
        ? raw.examples
            .map(normalizeExample)
            .filter(item => item.english || item.persian)
        : [];
    const synonyms = Array.isArray(raw.synonyms)
        ? raw.synonyms
            .map(normalizeSynonym)
            .filter(Boolean)
        : [];
    return {
        courseId: lesson.courseId ?? '',
        lessonId: lesson.id,
        word: String(raw.word ?? '').trim(),
        meaning: String(raw.meaning ?? '').trim(),
        level: String(raw.level ?? '').trim(),
        pos: String(raw.pos ?? '').trim(),
        synonyms,
        examples,
        miniContext: String(raw.miniContext ?? '').trim(),
    };
}
export async function loadManifest() {
    const response = await fetch('/data/manifest.json', {
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`Could not load manifest (${response.status})`);
    }
    const manifest = (await response.json());
    if (!manifest ||
        !Array.isArray(manifest.courses)) {
        throw new Error('Invalid manifest format');
    }
    const courses = manifest.courses.map(course => ({
        ...course,
        lessons: course.lessons.map(lesson => ({
            ...lesson,
            courseId: course.id,
        })),
    }));
    return {
        ...manifest,
        courses,
    };
}
export async function loadLesson(lesson) {
    const file = lesson.file
        .replace(/^\.\//, '')
        .replace(/^\//, '');
    const response = await fetch(`/data/${file}`);
    if (!response.ok) {
        throw new Error(`Failed to load ${lesson.id} (${response.status})`);
    }
    const raw = (await response.json());
    if (!Array.isArray(raw)) {
        throw new Error(`Invalid lesson format: ${lesson.id}`);
    }
    return raw
        .map(item => normalizeWord(item, lesson))
        .filter(item => item.word);
}
