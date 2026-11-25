/**
 * Educational content validation (Phase 10.7). Pure and self-contained (no runtime/DOM imports, only
 * sibling pure modules) so `scripts/validate-content.mjs` can load it directly.
 *
 * Input is the parsed JSON of everything under `public/data`, keyed by path relative to that folder.
 * Output is a list of issues. `error` = a learner would hit a broken or misleading screen, or a
 * relationship the app relies on is missing. `warning` = quality gaps worth fixing but not breaking.
 *
 * Nothing here judges language quality (grammar, naturalness): that needs a human or an AI reviewer,
 * whose output would only ever be a suggestion. These checks are structural and deterministic.
 */

import { findClozeMatch } from './clozeMatching.ts'

export interface RepoContent {
    /** Parsed JSON by path relative to public/data, e.g. `real-life/manifest.json`. */
    json: Record<string, unknown>
}

export type Severity = 'error' | 'warning'

export interface Issue {
    severity: Severity
    code: string
    path: string
    message: string
}

type Obj = Record<string, unknown>

const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const EXERCISE_TYPES = ['multiple-choice', 'fill-blank', 'translation', 'sentence-ordering', 'matching', 'short-answer', 'listening-comprehension', 'dictation', 'grammar-correction', 'reading-comprehension', 'writing-response']
const SKILLS = ['vocabulary', 'grammar', 'listening', 'speaking', 'reading', 'writing', 'pronunciation']
const PERSIAN = /[؀-ۿ]/
const LATIN = /[A-Za-z]/

/* ---------- small helpers (also used by the report) ---------- */

export function bandsOf(label: unknown): string[] {
    if (typeof label !== 'string' || !label) return []

    const indexes = label.split('-').map(part => BANDS.indexOf(part.trim().toUpperCase()))

    if (indexes.some(index => index < 0)) return []

    return BANDS.slice(Math.min(...indexes), Math.max(...indexes) + 1)
}

/** Stable id for a legacy plain-string objective. */
export function deriveObjectiveId(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '')
}

export interface NormalizedObjective {
    id: string
    text: string
    textPersian?: string
    explicit: boolean
}

export function objectivesOf(entry: unknown): NormalizedObjective[] {
    const list = isObj(entry) && Array.isArray(entry.learningObjectives) ? entry.learningObjectives : []
    const out: NormalizedObjective[] = []

    for (const item of list) {
        if (typeof item === 'string') out.push({ id: deriveObjectiveId(item), text: item, explicit: false })
        else if (isObj(item) && typeof item.id === 'string' && typeof item.text === 'string')
            out.push({ id: item.id, text: item.text, textPersian: typeof item.textPersian === 'string' ? item.textPersian : undefined, explicit: true })
    }

    return out
}

const isObj = (value: unknown): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const strs = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(str)
const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()

export const AREAS = [
    { area: 'grammar', dir: 'grammar', key: 'topics' },
    { area: 'listening', dir: 'listening', key: 'activities' },
    { area: 'reading', dir: 'reading', key: 'passages' },
    { area: 'real-life', dir: 'real-life', key: 'scenarios' },
] as const

export type TopicArea = (typeof AREAS)[number]['area']

export interface LoadedTopic {
    area: TopicArea
    id: string
    manifest: Obj
    file: Obj | null
    filePath: string
}

export function loadTopics(content: RepoContent): LoadedTopic[] {
    const topics: LoadedTopic[] = []

    for (const { area, dir, key } of AREAS) {
        const manifest = content.json[`${dir}/manifest.json`]
        const entries = isObj(manifest) && Array.isArray(manifest[key]) ? (manifest[key] as unknown[]) : []

        for (const entry of entries) {
            if (!isObj(entry)) continue

            const filePath = `${dir}/${String(entry.file ?? '').replace(/^\.\//, '')}`
            const file = content.json[filePath]

            topics.push({ area, id: String(entry.id ?? ''), manifest: entry, file: isObj(file) ? file : null, filePath })
        }
    }

    return topics
}

/* ---------- the validator ---------- */

export function validateContent(content: RepoContent): Issue[] {
    const issues: Issue[] = []
    const add = (severity: Severity, code: string, path: string, message: string) => issues.push({ severity, code, path, message })
    const error = (code: string, path: string, message: string) => add('error', code, path, message)
    const warn = (code: string, path: string, message: string) => add('warning', code, path, message)

    const topics = loadTopics(content)
    const exerciseIds = new Map<string, string>()
    const exerciseSignatures = new Map<string, string>()
    const expressionOwners = new Map<string, string>()

    /* ----- manifests ----- */
    for (const { area, dir, key } of AREAS) {
        const manifestPath = `${dir}/manifest.json`
        const manifest = content.json[manifestPath]

        if (!isObj(manifest) || !Array.isArray(manifest[key])) {
            error('manifest-invalid', manifestPath, `Missing or malformed manifest (expected "${key}" array).`)
            continue
        }

        const seen = new Set<string>()
        const referenced = new Set<string>()

        for (const [index, entry] of (manifest[key] as unknown[]).entries()) {
            const where = `${manifestPath}[${index}]`

            if (!isObj(entry)) {
                error('manifest-entry-invalid', where, 'Entry is not an object.')
                continue
            }

            if (!str(entry.id)) error('manifest-id-missing', where, 'Entry has no id.')
            else if (seen.has(entry.id)) error('manifest-id-duplicate', where, `Duplicate id "${entry.id}".`)
            else seen.add(entry.id)

            if (!str(entry.title)) error('manifest-title-missing', where, 'Entry has no title.')

            if (!str(entry.cefrLevel)) warn('cefr-missing', where, 'No cefrLevel.')
            else if (!bandsOf(entry.cefrLevel).length) error('cefr-invalid', where, `Unrecognised cefrLevel "${entry.cefrLevel}".`)

            if (!Array.isArray(entry.skillTags) || !entry.skillTags.length) warn('skill-tags-missing', where, 'No skillTags.')
            else if (entry.skillTags.some(tag => !SKILLS.includes(String(tag)))) error('skill-tag-invalid', where, 'Unknown skill tag.')

            if (typeof entry.difficulty !== 'number' || entry.difficulty < 1 || entry.difficulty > 5) warn('difficulty-invalid', where, 'difficulty should be a number from 1 to 5.')

            if (typeof entry.estimatedDuration !== 'number' && typeof entry.estimatedReadingTime !== 'number') warn('duration-missing', where, 'No estimated duration.')

            if (area !== 'listening' && area !== 'reading' && area !== 'grammar' && area !== 'real-life') continue

            if (!str(entry.file)) {
                error('manifest-file-missing', where, 'Entry has no file.')
                continue
            }

            const filePath = `${dir}/${entry.file.replace(/^\.\//, '')}`

            referenced.add(filePath)

            if (!isObj(content.json[filePath])) error('manifest-ref-broken', where, `File ${filePath} does not exist or is not valid JSON.`)

            if (area === 'real-life' && !str(entry.titlePersian)) warn('persian-missing', where, 'No titlePersian.')

            const objectives = objectivesOf(entry)

            if (!objectives.length) error('objectives-missing', where, 'No learning objectives.')

            const objectiveIds = new Set<string>()

            for (const objective of objectives) {
                if (!/^[a-z0-9][a-z0-9-]*$/.test(objective.id)) error('objective-id-invalid', where, `Objective id "${objective.id}" must be lowercase kebab-case.`)
                if (objectiveIds.has(objective.id)) error('objective-id-duplicate', where, `Duplicate objective id "${objective.id}".`)
                objectiveIds.add(objective.id)

                if (objective.explicit && !objective.textPersian) warn('objective-persian-missing', where, `Objective "${objective.id}" has no Persian text.`)
            }
        }

        /* Files in the folder that no manifest entry points at. */
        for (const path of Object.keys(content.json)) {
            if (path.startsWith(`${dir}/`) && !path.endsWith('manifest.json') && !referenced.has(path)) warn('orphan-file', path, 'File is not referenced by the manifest.')
        }
    }

    /* ----- topic files ----- */
    for (const topic of topics) {
        const file = topic.file

        if (!file) continue

        if (file.id !== undefined && file.id !== topic.id) error('topic-id-mismatch', topic.filePath, `File id "${String(file.id)}" does not match manifest id "${topic.id}".`)

        const objectives = new Map(objectivesOf(topic.manifest).map(objective => [objective.id, objective]))
        const exercises = Array.isArray(file.exercises) ? (file.exercises as unknown[]) : []

        if (!exercises.length) warn('no-exercises', topic.filePath, 'Topic has no exercises.')

        /* Area-specific content checks. */
        if (topic.area === 'real-life') {
            const expressions = Array.isArray(file.expressions) ? (file.expressions as unknown[]) : []

            if (expressions.length < 6) warn('few-expressions', topic.filePath, `Only ${expressions.length} expressions.`)

            const local = new Set<string>()

            for (const [index, expression] of expressions.entries()) {
                const where = `${topic.filePath}#expressions[${index}]`

                if (!isObj(expression) || !str(expression.english)) {
                    error('expression-invalid', where, 'Expression has no english text.')
                    continue
                }

                if (!str(expression.persian) || !PERSIAN.test(expression.persian)) error('persian-missing', where, `"${expression.english}" has no Persian meaning.`)
                if (!str(expression.example)) error('example-missing', where, `"${expression.english}" has no example sentence.`)
                if (!str(expression.examplePersian) || !PERSIAN.test(expression.examplePersian)) warn('example-persian-missing', where, `"${expression.english}" has no Persian example translation.`)

                const key = norm(expression.english)

                if (local.has(key)) error('expression-duplicate', where, `"${expression.english}" appears twice in this scenario.`)
                local.add(key)

                const owner = expressionOwners.get(key)

                if (owner && owner !== topic.id) warn('expression-duplicate-across', where, `"${expression.english}" is also taught in ${owner}.`)
                else expressionOwners.set(key, topic.id)
            }

            if (!isObj(file.speakingTask) || !strs(file.speakingTask.modelSentences)) error('speaking-task-missing', topic.filePath, 'No speakingTask with model sentences.')
            if (!isObj(file.roleplay) || !str(file.roleplay.opening) || !str(file.roleplay.aiRole)) error('roleplay-missing', topic.filePath, 'No usable roleplay.')
            if (!str(file.context) || !str(file.contextPersian)) warn('context-missing', topic.filePath, 'Missing bilingual context introduction.')
        }

        if (topic.area === 'grammar') {
            if (!str(file.explanation)) error('explanation-missing', topic.filePath, 'No explanation.')
            if (!str(file.explanationPersian)) warn('explanation-persian-missing', topic.filePath, 'No Persian explanation.')

            const examples = Array.isArray(file.examples) ? file.examples : []

            if (!examples.length) error('example-missing', topic.filePath, 'No examples.')
            if (examples.some(example => !isObj(example) || !str(example.english) || !str(example.persian))) warn('example-persian-missing', topic.filePath, 'An example lacks english or Persian text.')
        }

        if (topic.area === 'listening') {
            const lines = Array.isArray(file.lines) ? file.lines : []

            /* A "sentences" activity is dictation-only: its audio lives in the exercises' audioText. */
            const exercisesWithAudio = Array.isArray(file.exercises) && file.exercises.length > 0 && file.exercises.every(item => isObj(item) && str(item.audioText))

            if (!lines.length && !(topic.manifest.kind === 'sentences' && exercisesWithAudio)) error('audio-lines-missing', topic.filePath, 'Listening activity has no lines to speak.')
            if (lines.some(line => !isObj(line) || !str(line.english))) error('audio-line-empty', topic.filePath, 'A line has no english text for the speech service.')
            if (lines.some(line => !isObj(line) || !str(line.persian))) warn('line-persian-missing', topic.filePath, 'Some lines have no Persian transcript translation.')
            if (!str(file.scenario)) warn('scenario-missing', topic.filePath, 'No scenario shown before listening.')
        }

        if (topic.area === 'reading') {
            const paragraphs = Array.isArray(file.paragraphs) ? file.paragraphs : []

            if (!paragraphs.length) error('paragraphs-missing', topic.filePath, 'Passage has no paragraphs.')
            if (paragraphs.some(paragraph => !isObj(paragraph) || !str(paragraph.english))) error('paragraph-empty', topic.filePath, 'A paragraph has no english text.')
            if (!Array.isArray(file.vocabulary) || !file.vocabulary.length) warn('vocabulary-missing', topic.filePath, 'No support vocabulary.')
        }

        /* Topic-file objectives (legacy listening/reading copies) must agree with the manifest. */
        if (Array.isArray(file.learningObjectives)) {
            const own = objectivesOf(file).map(objective => objective.id)
            const manifestIds = [...objectives.keys()]

            if (own.join('|') !== manifestIds.join('|')) warn('objectives-mismatch', topic.filePath, 'learningObjectives differ between the manifest and the topic file.')
        }

        /* Exercises. */
        const topicBands = new Set(bandsOf(topic.manifest.cefrLevel))

        for (const [index, raw] of exercises.entries()) {
            const where = `${topic.filePath}#exercises[${index}]`

            if (!isObj(raw)) {
                error('exercise-invalid', where, 'Exercise is not an object.')
                continue
            }

            const type = String(raw.type)

            if (!str(raw.id)) error('exercise-id-missing', where, 'Exercise has no id.')
            else if (exerciseIds.has(raw.id)) error('exercise-id-duplicate', where, `Exercise id "${raw.id}" is also used in ${exerciseIds.get(raw.id)}.`)
            else exerciseIds.set(raw.id, topic.filePath)

            if (!EXERCISE_TYPES.includes(type)) {
                error('exercise-type-invalid', where, `Unknown exercise type "${type}".`)
                continue
            }

            if (!SKILLS.includes(String(raw.skill))) error('exercise-skill-invalid', where, `Invalid skill "${String(raw.skill)}".`)

            const bands = bandsOf(raw.cefrLevel)

            if (raw.cefrLevel === undefined) warn('exercise-cefr-missing', where, 'Exercise has no cefrLevel.')
            else if (!bands.length) error('cefr-invalid', where, `Unrecognised cefrLevel "${String(raw.cefrLevel)}".`)
            else if (topicBands.size && !bands.some(band => topicBands.has(band))) warn('cefr-inconsistent', where, `Exercise level ${String(raw.cefrLevel)} is outside the topic's ${String(topic.manifest.cefrLevel)}.`)

            if (!str(raw.explanation) && type !== 'dictation') warn('explanation-missing', where, 'No explanation shown after answering.')
            if (!str(raw.explanationPersian) && type !== 'dictation') warn('explanation-persian-missing', where, 'No Persian feedback.')
            else if (str(raw.explanationPersian) && !PERSIAN.test(raw.explanationPersian)) error('persian-feedback-not-persian', where, 'explanationPersian contains no Persian text.')
            if (str(raw.hintPersian) && !PERSIAN.test(raw.hintPersian)) warn('hint-persian-not-persian', where, 'hintPersian contains no Persian text.')

            /* Objective and target links. */
            if (raw.objectiveId !== undefined) {
                if (!str(raw.objectiveId) || !objectives.has(raw.objectiveId)) error('objective-unknown', where, `objectiveId "${String(raw.objectiveId)}" is not declared in the topic's learning objectives.`)
            }

            if (raw.targets !== undefined && !strs(raw.targets)) error('targets-invalid', where, 'targets must be a non-empty array of strings.')

            if (topic.area === 'real-life' && Array.isArray(raw.targets) && Array.isArray(file.expressions)) {
                const taught = new Set((file.expressions as unknown[]).filter(isObj).map(expression => norm(String(expression.english ?? ''))))

                for (const target of raw.targets.filter(str)) if (!taught.has(norm(target))) error('target-not-taught', where, `Target "${target}" is not one of this scenario's expressions.`)
            }

            validateExerciseBody(raw, type, where, error, warn)
            validateTypedExtras(raw, type, where, error)

            /* Duplicate exercises: same type and same prompt text. */
            const prompt = [raw.prompt, raw.source, raw.incorrectSentence, raw.before && `${String(raw.before)} ${String(raw.after ?? '')}`, raw.audioText, Array.isArray(raw.segments) && raw.segments.join(' ')].find(str)

            if (prompt) {
                const signature = `${type}|${norm(String(prompt))}|${Array.isArray(raw.options) ? raw.options.map(option => norm(String(option))).sort().join('/') : ''}`
                const first = exerciseSignatures.get(signature)

                if (first && first !== where) warn('exercise-duplicate', where, `Same ${type} prompt as ${first}.`)
                else exerciseSignatures.set(signature, where)
            }
        }
    }

    validateSecondaryAreas(content, issues)
    validateTransfer(content, topics, issues)
    validateVocabulary(content, issues)

    return issues
}

function validateExerciseBody(raw: Obj, type: string, where: string, error: (code: string, path: string, message: string) => void, warn: (code: string, path: string, message: string) => void) {
    const accepted = () => {
        if (!strs(raw.acceptedAnswers)) error('accepted-answers-missing', where, `${type} needs a non-empty acceptedAnswers list.`)
    }

    switch (type) {
        case 'multiple-choice':
        case 'listening-comprehension':
        case 'reading-comprehension': {
            const options = Array.isArray(raw.options) ? raw.options : []

            if (!str(raw.prompt)) error('prompt-missing', where, 'No prompt.')
            if (options.length < 2 || options.some(option => !str(option))) error('options-invalid', where, 'Needs at least two non-empty options.')
            else if (new Set(options.map(option => norm(String(option)))).size !== options.length) error('options-duplicate', where, 'Two options are identical.')
            if (typeof raw.correctIndex !== 'number' || raw.correctIndex < 0 || raw.correctIndex >= options.length) error('correct-index-invalid', where, 'correctIndex is outside the options.')
            if (type === 'listening-comprehension' && !str(raw.audioText)) error('audio-text-missing', where, 'No audioText for the speech service.')
            break
        }

        case 'fill-blank':
            if (!str(raw.before) && !str(raw.after)) error('blank-context-missing', where, 'Needs text before or after the blank.')
            accepted()
            break

        case 'translation':
            if (!str(raw.source)) error('source-missing', where, 'No source text.')
            else if (raw.sourceLang === 'fa' && !PERSIAN.test(raw.source)) error('source-language-mismatch', where, 'sourceLang is "fa" but the source has no Persian text.')
            else if (raw.sourceLang === 'en' && PERSIAN.test(raw.source)) error('source-language-mismatch', where, 'sourceLang is "en" but the source is Persian.')
            else if (raw.sourceLang !== 'fa' && raw.sourceLang !== 'en') error('source-lang-invalid', where, 'sourceLang must be "fa" or "en".')

            accepted()

            if (Array.isArray(raw.acceptedAnswers) && raw.acceptedAnswers.filter(str).length < 2) warn('few-alternatives', where, 'Only one accepted wording: valid alternatives may be marked wrong.')
            break

        case 'short-answer':
            if (!str(raw.prompt)) error('prompt-missing', where, 'No prompt.')
            accepted()
            break

        case 'grammar-correction':
            if (!str(raw.incorrectSentence)) error('incorrect-sentence-missing', where, 'No incorrectSentence.')
            accepted()

            if (str(raw.incorrectSentence) && Array.isArray(raw.acceptedAnswers) && raw.acceptedAnswers.filter(str).some(answer => norm(answer) === norm(String(raw.incorrectSentence)))) error('correction-unchanged', where, 'An accepted answer equals the incorrect sentence.')
            break

        case 'dictation':
            if (!str(raw.audioText)) error('audio-text-missing', where, 'No audioText for the speech service.')
            accepted()

            if (str(raw.audioText) && Array.isArray(raw.acceptedAnswers) && !raw.acceptedAnswers.filter(str).some(answer => norm(answer) === norm(String(raw.audioText)))) warn('dictation-answer-mismatch', where, 'No accepted answer matches the spoken text.')
            break

        case 'sentence-ordering':
            if (!Array.isArray(raw.segments) || raw.segments.length < 3 || raw.segments.some(segment => !str(segment))) error('segments-invalid', where, 'Needs at least three non-empty segments.')
            break

        case 'matching':
            if (!Array.isArray(raw.pairs) || raw.pairs.length < 2 || raw.pairs.some(pair => !isObj(pair) || !str(pair.left) || !str(pair.right))) error('pairs-invalid', where, 'Needs at least two complete pairs.')
            break

        case 'writing-response':
            if (!str(raw.prompt)) error('prompt-missing', where, 'No prompt.')
            break
    }
}

function validateTypedExtras(raw: Obj, type: string, where: string, error: (code: string, path: string, message: string) => void) {
    if (raw.acceptableAnswers !== undefined) {
        const list = Array.isArray(raw.acceptableAnswers) ? raw.acceptableAnswers : []

        if (!list.length || list.some(item => !isObj(item) || !str(item.text) || !str(item.note))) error('acceptable-answers-invalid', where, 'acceptableAnswers need text and a note.')

        if (list.some(item => isObj(item) && str(item.notePersian) && !PERSIAN.test(item.notePersian))) error('persian-feedback-not-persian', where, 'An acceptableAnswers notePersian contains no Persian text.')

        const accepted = new Set((Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers : []).filter(str).map(norm))

        if (list.some(item => isObj(item) && str(item.text) && accepted.has(norm(item.text)))) error('acceptable-answers-overlap', where, 'An acceptableAnswer is already in acceptedAnswers.')
    }

    if (raw.commonErrors !== undefined) {
        const list = Array.isArray(raw.commonErrors) ? raw.commonErrors : []

        for (const item of list) {
            if (!isObj(item) || !str(item.match) || !str(item.feedback) || !str(item.feedbackPersian) || !PERSIAN.test(String(item.feedbackPersian))) {
                error('common-error-invalid', where, 'commonErrors need match, feedback and Persian feedback.')
                continue
            }

            try {
                const pattern = new RegExp(item.match, 'i')
                const accepted = (Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers : []).filter(str)

                if (accepted.some(answer => pattern.test(answer))) error('common-error-matches-correct', where, `commonError /${item.match}/ also matches a correct answer.`)
            } catch {
                error('common-error-regex', where, `commonError pattern /${item.match}/ is not a valid regular expression.`)
            }
        }
    }

    if (raw.hint !== undefined && !str(raw.hint)) error('hint-invalid', where, 'hint must be non-empty text.')
    if (raw.hint !== undefined && !['fill-blank', 'translation', 'short-answer', 'grammar-correction'].includes(type)) error('hint-unsupported', where, `${type} exercises do not offer hints.`)
}

function validateSecondaryAreas(content: RepoContent, issues: Issue[]) {
    const add = (severity: Severity, code: string, path: string, message: string) => issues.push({ severity, code, path, message })

    const speaking = content.json['speaking/manifest.json']
    const topics = isObj(speaking) && Array.isArray(speaking.topics) ? (speaking.topics as unknown[]) : null

    if (!topics) add('error', 'manifest-invalid', 'speaking/manifest.json', 'Missing or malformed speaking manifest.')
    else {
        const seen = new Set<string>()

        for (const [index, topic] of topics.entries()) {
            const where = `speaking/manifest.json[${index}]`

            if (!isObj(topic) || !str(topic.id)) {
                add('error', 'manifest-id-missing', where, 'Topic has no id.')
                continue
            }

            if (seen.has(topic.id)) add('error', 'manifest-id-duplicate', where, `Duplicate id "${topic.id}".`)
            seen.add(topic.id)

            if (!bandsOf(topic.cefrLevel).length) add('error', 'cefr-invalid', where, `Unrecognised cefrLevel "${String(topic.cefrLevel)}".`)

            const steps = Array.isArray(topic.steps) ? topic.steps : []

            if (!steps.length) add('error', 'steps-missing', where, 'No steps.')
            if (!steps.some(step => isObj(step) && step.kind === 'repeat')) add('warning', 'speaking-no-repeat', where, 'No listen-and-repeat step.')
            if (!steps.some(step => isObj(step) && step.kind === 'open')) add('warning', 'speaking-no-open', where, 'No independent response step.')

            for (const [stepIndex, step] of steps.entries()) {
                if (!isObj(step) || !str(step.prompt) || !['repeat', 'open'].includes(String(step.kind))) add('error', 'step-invalid', `${where}.steps[${stepIndex}]`, 'Step needs a prompt and kind repeat|open.')
                else if (!str(step.promptPersian)) add('warning', 'persian-missing', `${where}.steps[${stepIndex}]`, 'Step has no Persian prompt.')
            }
        }
    }

    const writing = content.json['writing/manifest.json']
    const prompts = isObj(writing) && Array.isArray(writing.prompts) ? (writing.prompts as unknown[]) : null

    if (!prompts) add('error', 'manifest-invalid', 'writing/manifest.json', 'Missing or malformed writing manifest.')
    else {
        const seen = new Set<string>()

        for (const [index, prompt] of prompts.entries()) {
            const where = `writing/manifest.json[${index}]`

            if (!isObj(prompt) || !str(prompt.id) || !str(prompt.instructions)) {
                add('error', 'writing-prompt-invalid', where, 'Prompt needs id and instructions.')
                continue
            }

            if (seen.has(prompt.id)) add('error', 'manifest-id-duplicate', where, `Duplicate id "${prompt.id}".`)
            seen.add(prompt.id)

            if (!bandsOf(prompt.cefrLevel).length) add('error', 'cefr-invalid', where, `Unrecognised cefrLevel "${String(prompt.cefrLevel)}".`)
            if (!str(prompt.instructionsPersian)) add('warning', 'persian-missing', where, 'No Persian instructions.')
        }
    }

    const conversation = content.json['conversation/scenarios.json']
    const scenarios = isObj(conversation) && Array.isArray(conversation.scenarios) ? (conversation.scenarios as unknown[]) : null

    if (!scenarios) add('error', 'manifest-invalid', 'conversation/scenarios.json', 'Missing or malformed conversation scenarios.')
    else {
        for (const [index, scenario] of scenarios.entries()) {
            const where = `conversation/scenarios.json[${index}]`

            if (!isObj(scenario) || !str(scenario.id) || !str(scenario.opening) || !str(scenario.objective)) add('error', 'scenario-invalid', where, 'Scenario needs id, objective and opening.')
            else if (!bandsOf(scenario.cefrLevel).length) add('error', 'cefr-invalid', where, `Unrecognised cefrLevel "${String(scenario.cefrLevel)}".`)
        }
    }
}

function validateTransfer(content: RepoContent, topics: LoadedTopic[], issues: Issue[]) {
    const add = (severity: Severity, code: string, path: string, message: string) => issues.push({ severity, code, path, message })
    const data = content.json['transfer/patterns.json']
    const patterns = isObj(data) && Array.isArray(data.patterns) ? (data.patterns as unknown[]) : null

    if (!patterns) {
        add('error', 'manifest-invalid', 'transfer/patterns.json', 'Missing or malformed transfer patterns.')
        return
    }

    /* Expressions the learner can actually be taught: Real-Life expressions. */
    const taught: string[] = []

    for (const topic of topics) {
        if (topic.area === 'real-life' && topic.file && Array.isArray(topic.file.expressions))
            for (const expression of topic.file.expressions) if (isObj(expression) && str(expression.english)) taught.push(expression.english)
    }

    const seen = new Set<string>()

    for (const [index, pattern] of patterns.entries()) {
        const where = `transfer/patterns.json[${index}]`

        if (!isObj(pattern) || !str(pattern.id)) {
            add('error', 'pattern-invalid', where, 'Pattern has no id.')
            continue
        }

        if (seen.has(pattern.id)) add('error', 'manifest-id-duplicate', where, `Duplicate pattern id "${pattern.id}".`)
        seen.add(pattern.id)

        if (!str(pattern.title) || !str(pattern.titlePersian) || !PERSIAN.test(String(pattern.titlePersian))) add('error', 'persian-missing', where, 'Pattern needs title and Persian title.')
        if (!str(pattern.frame)) add('error', 'pattern-frame-missing', where, 'No frame.')
        if (!str(pattern.explanation) || !str(pattern.explanationPersian)) add('warning', 'pattern-explanation-missing', where, 'No bilingual explanation of the language pattern.')
        if (!str(pattern.example) || !str(pattern.examplePersian)) add('warning', 'pattern-example-missing', where, 'No natural example (English and Persian).')

        const matches = Array.isArray(pattern.matches) ? pattern.matches.filter(str) : []
        const regexes: RegExp[] = []

        for (const source of matches) {
            try {
                regexes.push(new RegExp(source, 'i'))
            } catch {
                add('error', 'pattern-regex', where, `matches entry /${source}/ is not a valid regular expression.`)
            }
        }

        if (!regexes.length) add('error', 'pattern-matches-missing', where, 'No matches patterns: no expression can anchor this pattern.')

        const anchors = taught.filter(text => regexes.some(regex => regex.test(text)))

        if (regexes.length && !anchors.length) add('error', 'pattern-unreachable', where, 'No taught expression matches this pattern, so no learner can ever reach it.')
        else if (regexes.length && anchors.length < 2) add('warning', 'pattern-few-anchors', where, `Only ${anchors.length} taught expression(s) anchor this pattern.`)

        const contexts = Array.isArray(pattern.contexts) ? pattern.contexts : []
        const levels: number[] = []
        const ids = new Set<string>()

        if (contexts.length < 5) add('error', 'pattern-few-contexts', where, `Only ${contexts.length} situations; at least five are needed.`)

        for (const [contextIndex, context] of contexts.entries()) {
            const here = `${where}.contexts[${contextIndex}]`

            if (!isObj(context) || !str(context.id) || !str(context.situation) || !str(context.goal)) {
                add('error', 'context-invalid', here, 'Situation needs id, situation and goal.')
                continue
            }

            if (ids.has(context.id)) add('error', 'context-id-duplicate', here, `Duplicate situation id "${context.id}".`)
            ids.add(context.id)

            if (![1, 2, 3].includes(Number(context.level))) add('error', 'context-level-invalid', here, 'level must be 1, 2 or 3.')
            else levels.push(Number(context.level))

            if (!str(context.situationPersian) || !str(context.goalPersian)) add('error', 'persian-missing', here, 'Situation needs Persian text.')
            if (!strs(context.references)) add('error', 'context-references-missing', here, 'No reference answers.')
            else if (context.references.length < 2) add('warning', 'few-alternatives', here, 'Only one reference answer.')
            if (!str(context.feedback) || !str(context.feedbackPersian)) add('warning', 'context-feedback-missing', here, 'No contextual feedback (English and Persian).')

            /* A situation must not hand over the pattern: it would turn production into copying. */
            const prompt = `${String(context.situation)} ${String(context.goal)}`

            if (regexes.some(regex => regex.test(prompt))) add('error', 'context-gives-away-pattern', here, 'The situation text already contains the pattern wording.')
        }

        if (levels.length && Math.min(...levels) !== 1) add('warning', 'pattern-no-level-1', where, 'No level-1 (easiest) situation.')
        if (levels.length >= 3 && new Set(levels).size < 2) add('warning', 'pattern-flat-difficulty', where, 'All situations share one difficulty level: no progression.')
    }
}

function validateVocabulary(content: RepoContent, issues: Issue[]) {
    const add = (severity: Severity, code: string, path: string, message: string) => issues.push({ severity, code, path, message })
    const manifest = content.json['manifest.json']

    if (!isObj(manifest) || !Array.isArray(manifest.courses)) {
        add('error', 'manifest-invalid', 'manifest.json', 'Missing or malformed vocabulary manifest.')
        return
    }

    const seenCourses = new Set<string>()

    for (const course of manifest.courses as unknown[]) {
        if (!isObj(course) || !str(course.id)) {
            add('error', 'manifest-id-missing', 'manifest.json', 'Course has no id.')
            continue
        }

        if (seenCourses.has(course.id)) add('error', 'manifest-id-duplicate', 'manifest.json', `Duplicate course id "${course.id}".`)
        seenCourses.add(course.id)

        const lessons = Array.isArray(course.lessons) ? course.lessons : []
        const lessonIds = new Set<string>()

        for (const lesson of lessons) {
            if (!isObj(lesson) || !str(lesson.id) || !str(lesson.file)) {
                add('error', 'manifest-entry-invalid', `manifest.json:${course.id}`, 'Lesson needs id and file.')
                continue
            }

            if (lessonIds.has(lesson.id)) add('error', 'manifest-id-duplicate', `manifest.json:${course.id}`, `Duplicate lesson id "${lesson.id}".`)
            lessonIds.add(lesson.id)

            /* Course folders: upgrade lessons sit at the root, others under their id (hard, oxford/<level>, 504 …). */
            const relative = lesson.file.replace(/^\.\//, '')
            const candidates = [relative, `${course.id}/${relative}`]
            const path = candidates.find(candidate => content.json[candidate] !== undefined)

            if (!path) {
                add('error', 'manifest-ref-broken', `manifest.json:${course.id}/${lesson.id}`, `Lesson file ${lesson.file} does not exist.`)
                continue
            }

            const words = content.json[path]

            if (!Array.isArray(words)) {
                add('error', 'lesson-invalid', path, 'Lesson file is not an array.')
                continue
            }

            const local = new Set<string>()
            const templateSentences = new Map<string, string[]>()

            for (const [index, word] of words.entries()) {
                const where = `${path}[${index}]`

                if (!isObj(word) || !str(word.word)) {
                    add('error', 'word-invalid', where, 'Entry has no word.')
                    continue
                }

                if (!str(word.meaning) || !PERSIAN.test(word.meaning)) add('error', 'persian-missing', where, `"${word.word}" has no Persian meaning.`)
                if (LATIN.test(String(word.meaning ?? '')) && !PERSIAN.test(String(word.meaning ?? ''))) add('warning', 'meaning-not-persian', where, `"${word.word}" meaning is not Persian.`)
                if (!str(word.pos)) add('warning', 'pos-missing', where, `"${word.word}" has no part of speech.`)

                const examples = Array.isArray(word.examples) ? word.examples : []

                if (!examples.length) add('warning', 'example-missing', where, `"${word.word}" has no example sentence.`)

                /* A word's own 3 examples should each show a different use, not repeat one sentence. */
                const ownSentences = new Set<string>()

                for (const example of examples) {
                    const english = isObj(example) ? example.english : Array.isArray(example) ? example[0] : undefined

                    if (!str(english)) continue

                    const key = norm(String(english))

                    if (ownSentences.has(key)) add('warning', 'example-duplicate-within-word', where, `"${word.word}" repeats the same example sentence more than once.`)
                    ownSentences.add(key)
                }

                /* The headword with any parenthetical sense marker stripped, exactly as ClozeView.buildQuestion derives it. */
                const headword = String(word.word).replace(/\s*\([^)]*\)/g, '').trim()
                const headwordPattern = headword ? new RegExp(`\\b${headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null
                const clozeVariants = Array.isArray(word.clozeVariants) ? word.clozeVariants.filter(str) : []
                const clozeCandidates = headword ? [headword, ...clozeVariants] : []
                /* A headword that is itself a learner placeholder ("do sth", "tell sb/sth") or a slash
                   alternative ("borrow/lend") is never meant to be found verbatim in a sentence — the app's
                   own Cloze builder will always skip it, by design, so it's not a content gap to flag. */
                const isPlaceholderHeadword = /\b(?:sth|sb|sbs|someone|something)\b|\/|\betc\.?$/iu.test(headword)
                let clozeReachable = false

                for (const [exampleIndex, example] of examples.entries()) {
                    const exampleWhere = `${where}.examples[${exampleIndex}]`
                    const english = isObj(example) ? example.english : Array.isArray(example) ? example[0] : undefined
                    const persian = isObj(example) ? example.persian : Array.isArray(example) ? example[1] : undefined

                    if (!str(english)) {
                        add('error', 'example-sentence-empty', exampleWhere, `"${word.word}" has an empty example sentence.`)
                        continue
                    }

                    if (!str(persian) || !PERSIAN.test(String(persian))) {
                        add('error', 'example-persian-missing', exampleWhere, `"${word.word}" example has no Persian translation.`)
                    } else if (headwordPattern && headwordPattern.test(String(persian))) {
                        add('error', 'example-headword-untranslated', exampleWhere, `"${word.word}" example's Persian translation still contains the English headword instead of translating it.`)
                    }

                    /* Matches the app's real Cloze logic (src/services/clozeMatching.ts): Unicode-aware,
                       whitespace/apostrophe/hyphen-normalized, and aware of authored clozeVariants. */
                    const clozeMatch = clozeCandidates.length ? findClozeMatch(String(english), clozeCandidates) : null

                    if (clozeMatch) {
                        clozeReachable = true

                        /* Group by the sentence with the matched phrase blanked out, so repeated mechanical
                           templates surface regardless of which word fills the slot. */
                        const shape = norm(`${String(english).slice(0, clozeMatch.start)}<WORD>${String(english).slice(clozeMatch.end)}`)
                        const group = templateSentences.get(shape) ?? []

                        group.push(exampleWhere)
                        templateSentences.set(shape, group)
                    }
                }

                if (examples.length && !clozeReachable && !isPlaceholderHeadword) add('warning', 'cloze-unreachable', where, `"${word.word}" has no example containing the headword (or an authored clozeVariant) as a whole word/phrase, so it can never appear in a Cloze exercise.`)

                const key = norm(word.word)

                if (local.has(key)) add('warning', 'word-duplicate', where, `"${word.word}" appears twice in this lesson.`)
                local.add(key)
            }

            for (const [shape, locations] of templateSentences) {
                if (locations.length >= 3) add('error', 'example-template-repeated', path, `${locations.length} examples share the same recycled sentence shape ("${shape}"): ${locations.join(', ')}.`)
            }
        }
    }
}

/* ---------- reporting ---------- */

export function summarizeIssues(issues: Issue[]) {
    const byCode = new Map<string, { severity: Severity; count: number }>()

    for (const issue of issues) {
        const entry = byCode.get(issue.code) ?? { severity: issue.severity, count: 0 }

        entry.count++
        byCode.set(issue.code, entry)
    }

    return {
        errors: issues.filter(issue => issue.severity === 'error').length,
        warnings: issues.filter(issue => issue.severity === 'warning').length,
        byCode: [...byCode.entries()].map(([code, value]) => ({ code, ...value })).sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1)),
    }
}
