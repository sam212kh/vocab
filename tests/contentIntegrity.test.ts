import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validateAnswer } from '../src/services/exerciseEngine'
import type { Exercise } from '../src/types/exercise'

/*
 * Filesystem-level integrity checks for the Phase 3 content modules
 * (grammar / reading / listening / writing / speaking) — the same class of
 * protection tests/manifestIntegrity.test.ts gives the vocabulary manifest.
 * Every exercise in shipped content must be structurally valid for the
 * unified exercise engine.
 */

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../public/data')

function load(path: string): unknown {
    return JSON.parse(readFileSync(join(dataDir, path), 'utf-8'))
}

interface HasExercises {
    exercises: Exercise[]
}

function collectModuleExercises(
    manifestPath: string,
    listKey: 'topics' | 'passages' | 'activities',
    dirName: string
): { id: string; exercises: Exercise[] }[] {
    const manifest = load(manifestPath) as Record<string, { id: string; file: string }[]>
    const entries = manifest[listKey]

    return entries.map(entry => {
        const content = load(`${dirName}/${entry.file.replace(/^\.\//, '')}`) as HasExercises

        return { id: entry.id, exercises: content.exercises }
    })
}

function expectStructurallyValid(exercise: Exercise, owner: string) {
    expect(exercise.id, `${owner}: exercise missing id`).toBeTruthy()
    expect(exercise.skill, `${owner}/${exercise.id}: missing skill`).toBeTruthy()

    switch (exercise.type) {
        case 'multiple-choice':
        case 'listening-comprehension':
        case 'reading-comprehension':
            expect(exercise.options.length, `${owner}/${exercise.id}`).toBeGreaterThanOrEqual(2)
            expect(exercise.correctIndex, `${owner}/${exercise.id}`).toBeGreaterThanOrEqual(0)
            expect(exercise.correctIndex, `${owner}/${exercise.id}`).toBeLessThan(exercise.options.length)
            break

        case 'fill-blank':
        case 'translation':
        case 'short-answer':
        case 'dictation':
        case 'grammar-correction':
            expect(exercise.acceptedAnswers.length, `${owner}/${exercise.id}`).toBeGreaterThan(0)
            break

        case 'sentence-ordering':
            expect(exercise.segments.length, `${owner}/${exercise.id}`).toBeGreaterThanOrEqual(2)
            break

        case 'matching':
            expect(exercise.pairs.length, `${owner}/${exercise.id}`).toBeGreaterThanOrEqual(2)
            break

        case 'writing-response':
            expect(exercise.prompt, `${owner}/${exercise.id}`).toBeTruthy()
            break
    }
}

describe('phase 3 content integrity', () => {
    const modules = [
        { name: 'grammar', manifest: 'grammar/manifest.json', listKey: 'topics' as const, dir: 'grammar' },
        { name: 'reading', manifest: 'reading/manifest.json', listKey: 'passages' as const, dir: 'reading' },
        { name: 'listening', manifest: 'listening/manifest.json', listKey: 'activities' as const, dir: 'listening' },
    ]

    for (const moduleDef of modules) {
        it(`${moduleDef.name}: every manifest entry resolves to a file with valid exercises`, () => {
            const manifest = load(moduleDef.manifest) as Record<string, { id: string; file: string }[]>

            for (const entry of manifest[moduleDef.listKey]) {
                const filePath = join(dataDir, moduleDef.dir, entry.file.replace(/^\.\//, ''))
                expect(existsSync(filePath), `${moduleDef.name}/${entry.id} file missing`).toBe(true)
            }

            const contents = collectModuleExercises(moduleDef.manifest, moduleDef.listKey, moduleDef.dir)

            for (const content of contents) {
                expect(content.exercises.length, `${moduleDef.name}/${content.id} has no exercises`).toBeGreaterThan(0)

                for (const exercise of content.exercises) {
                    expectStructurallyValid(exercise, `${moduleDef.name}/${content.id}`)
                }
            }
        })

        it(`${moduleDef.name}: exercise ids are unique across the module`, () => {
            const contents = collectModuleExercises(moduleDef.manifest, moduleDef.listKey, moduleDef.dir)

            const ids = contents.flatMap(content => content.exercises.map(exercise => exercise.id))

            expect(new Set(ids).size).toBe(ids.length)
        })
    }

    it('every shipped exercise can be validated by the engine with its own canonical answer', () => {
        const allModules = [
            ...collectModuleExercises('grammar/manifest.json', 'topics', 'grammar'),
            ...collectModuleExercises('reading/manifest.json', 'passages', 'reading'),
            ...collectModuleExercises('listening/manifest.json', 'activities', 'listening'),
        ]

        for (const content of allModules) {
            for (const exercise of content.exercises) {
                let result

                switch (exercise.type) {
                    case 'multiple-choice':
                    case 'listening-comprehension':
                    case 'reading-comprehension':
                        result = validateAnswer(exercise, { kind: 'choice', index: exercise.correctIndex })
                        break

                    case 'fill-blank':
                    case 'translation':
                    case 'short-answer':
                    case 'dictation':
                    case 'grammar-correction':
                        result = validateAnswer(exercise, { kind: 'text', text: exercise.acceptedAnswers[0] })
                        break

                    case 'sentence-ordering':
                        result = validateAnswer(exercise, {
                            kind: 'ordering',
                            order: exercise.segments.map((_, index) => index),
                        })
                        break

                    case 'matching':
                        result = validateAnswer(exercise, {
                            kind: 'matching',
                            matches: exercise.pairs.map((_, index) => ({ leftIndex: index, rightIndex: index })),
                        })
                        break

                    default:
                        continue
                }

                expect(result.correct, `${content.id}/${exercise.id}: canonical answer rejected`).toBe(true)
            }
        }
    })

    it('real-life scenarios are complete: bilingual, expressions, exercises, speaking task, roleplay', () => {
        const manifest = load('real-life/manifest.json') as { scenarios: { id: string; file: string; titlePersian: string; cefrLevel?: string; icon: string }[] }

        expect(manifest.scenarios.length).toBeGreaterThanOrEqual(10)

        const ids = manifest.scenarios.map(entry => entry.id)
        expect(new Set(ids).size).toBe(ids.length)

        const allExerciseIds: string[] = []

        for (const entry of manifest.scenarios) {
            expect(entry.titlePersian, `${entry.id}: Persian title`).toBeTruthy()
            expect(entry.cefrLevel, `${entry.id}: cefr`).toBeTruthy()
            expect(entry.icon, `${entry.id}: icon`).toBeTruthy()

            const scenario = load(`real-life/${entry.file.replace(/^\.\//, '')}`) as {
                context: string; contextPersian: string
                expressions: { english: string; persian: string; example: string; examplePersian: string }[]
                exercises: Exercise[]
                speakingTask: { instruction: string; instructionPersian: string; modelSentences: string[] }
                roleplay: { aiRole: string; learnerRole: string; objective: string; context: string; opening: string }
            }

            expect(scenario.context.length, `${entry.id}: context`).toBeGreaterThan(20)
            expect(/[؀-ۿ]/.test(scenario.contextPersian), `${entry.id}: Persian context`).toBe(true)

            expect(scenario.expressions.length, `${entry.id}: 8-12 expressions`).toBeGreaterThanOrEqual(8)
            expect(scenario.expressions.length, `${entry.id}: 8-12 expressions`).toBeLessThanOrEqual(12)

            for (const expression of scenario.expressions) {
                expect(expression.english, `${entry.id}: expression english`).toBeTruthy()
                expect(/[؀-ۿ]/.test(expression.persian), `${entry.id}/${expression.english}: Persian meaning`).toBe(true)
                expect(expression.example.length, `${entry.id}/${expression.english}: example`).toBeGreaterThan(10)
                expect(/[؀-ۿ]/.test(expression.examplePersian), `${entry.id}/${expression.english}: Persian example`).toBe(true)
            }

            expect(scenario.exercises.length, `${entry.id}: >=3 exercises`).toBeGreaterThanOrEqual(3)

            for (const exercise of scenario.exercises) {
                expectStructurallyValid(exercise, `real-life/${entry.id}`)
                allExerciseIds.push(exercise.id)
            }

            expect(scenario.speakingTask.modelSentences.length, `${entry.id}: model sentences`).toBeGreaterThanOrEqual(3)
            expect(/[؀-ۿ]/.test(scenario.speakingTask.instructionPersian), `${entry.id}: Persian instruction`).toBe(true)

            expect(scenario.roleplay.opening.length, `${entry.id}: roleplay opening`).toBeGreaterThan(10)
            expect(scenario.roleplay.aiRole.length, `${entry.id}: aiRole`).toBeGreaterThan(5)
        }

        expect(new Set(allExerciseIds).size, 'real-life exercise ids unique').toBe(allExerciseIds.length)
    })

    it('career content meets the required counts and bilingual completeness', () => {
        const persian = (value: string) => /[؀-ۿ]/.test(value)

        const general = load('career/general.json') as { questions: Record<string, any>[] }
        const salary = load('career/salary.json') as { questions: Record<string, any>[] }
        const remote = load('career/remote.json') as { questions: Record<string, any>[] }
        const behavioral = load('career/behavioral.json') as { scenarios: Record<string, any>[] }
        const workplace = load('career/workplace.json') as { dialogues: Record<string, any>[] }

        expect(general.questions.length).toBeGreaterThanOrEqual(20)
        expect(behavioral.scenarios.length).toBeGreaterThanOrEqual(20)
        expect(salary.questions.length).toBeGreaterThanOrEqual(10)
        expect(remote.questions.length).toBeGreaterThanOrEqual(10)
        expect(workplace.dialogues.length).toBeGreaterThanOrEqual(10)

        const allIds: string[] = []

        for (const section of [general, salary, remote]) {
            for (const question of section.questions) {
                allIds.push(question.id)
                expect(question.question.length, `${question.id}: question`).toBeGreaterThan(8)
                expect(persian(question.questionPersian), `${question.id}: Persian question`).toBe(true)
                expect(persian(question.intentionPersian), `${question.id}: Persian intention`).toBe(true)
                expect(question.intention.length, `${question.id}: intention`).toBeGreaterThan(15)
                expect(question.structure.length, `${question.id}: structure`).toBeGreaterThan(15)
                expect(question.example.length, `${question.id}: example`).toBeGreaterThan(40)
                expect(question.vocabulary.length, `${question.id}: vocabulary`).toBeGreaterThanOrEqual(3)

                for (const item of question.vocabulary) {
                    expect(persian(item.persian), `${question.id}/${item.english}: Persian vocab`).toBe(true)
                }
            }
        }

        for (const scenario of behavioral.scenarios) {
            allIds.push(scenario.id)
            expect(persian(scenario.promptPersian), `${scenario.id}: Persian prompt`).toBe(true)
            expect(scenario.usefulPhrases.length, `${scenario.id}: phrases`).toBeGreaterThanOrEqual(3)

            /* STAR structure: all four hints present and substantive. */
            for (const key of ['situation', 'task', 'action', 'result']) {
                expect(scenario.starHints[key]?.length, `${scenario.id}: STAR hint ${key}`).toBeGreaterThan(15)
            }
        }

        for (const dialogue of workplace.dialogues) {
            allIds.push(dialogue.id)
            expect(dialogue.lines.length, `${dialogue.id}: lines`).toBeGreaterThanOrEqual(3)

            for (const line of dialogue.lines) {
                expect(line.english.length, `${dialogue.id}: line`).toBeGreaterThan(5)
                expect(persian(line.persian), `${dialogue.id}: Persian line`).toBe(true)
            }
        }

        expect(new Set(allIds).size, 'career ids unique').toBe(allIds.length)
    })

    it('career manifest lists every section file', () => {
        const manifest = load('career/manifest.json') as { sections: { id: string; file: string; titlePersian: string }[] }

        expect(manifest.sections.map(section => section.id).sort()).toEqual(
            ['behavioral', 'general', 'remote', 'salary', 'workplace']
        )

        for (const section of manifest.sections) {
            expect(existsSync(join(dataDir, 'career', section.file.replace(/^\.\//, ''))), `${section.id}: file`).toBe(true)
            expect(/[؀-ۿ]/.test(section.titlePersian)).toBe(true)
        }
    })

    it('every real-life exercise canonical answer passes the engine', () => {
        const manifest = load('real-life/manifest.json') as { scenarios: { id: string; file: string }[] }

        for (const entry of manifest.scenarios) {
            const scenario = load(`real-life/${entry.file.replace(/^\.\//, '')}`) as HasExercises

            for (const exercise of scenario.exercises) {
                let result

                switch (exercise.type) {
                    case 'multiple-choice':
                    case 'listening-comprehension':
                    case 'reading-comprehension':
                        result = validateAnswer(exercise, { kind: 'choice', index: exercise.correctIndex })
                        break
                    case 'fill-blank':
                    case 'translation':
                    case 'short-answer':
                    case 'dictation':
                    case 'grammar-correction':
                        result = validateAnswer(exercise, { kind: 'text', text: exercise.acceptedAnswers[0] })
                        break
                    case 'sentence-ordering':
                        result = validateAnswer(exercise, { kind: 'ordering', order: exercise.segments.map((_, index) => index) })
                        break
                    default:
                        continue
                }

                expect(result.correct, `real-life/${entry.id}/${exercise.id}: canonical answer rejected`).toBe(true)
            }
        }
    })

    it('writing manifest prompts are well-formed', () => {
        const manifest = load('writing/manifest.json') as { prompts: { id: string; instructions: string; minWords?: number; maxWords?: number }[] }

        expect(manifest.prompts.length).toBeGreaterThan(0)

        for (const prompt of manifest.prompts) {
            expect(prompt.id).toBeTruthy()
            expect(prompt.instructions.length).toBeGreaterThan(10)

            if (prompt.minWords !== undefined && prompt.maxWords !== undefined) {
                expect(prompt.minWords).toBeLessThan(prompt.maxWords)
            }
        }
    })

    it('conversation scenarios are well-formed with all required roleplay fields', () => {
        const manifest = load('conversation/scenarios.json') as {
            scenarios: {
                id: string; title: string; aiRole: string; learnerRole: string
                objective: string; context: string; opening: string; cefrLevel?: string
            }[]
        }

        expect(manifest.scenarios.length).toBeGreaterThan(0)

        const ids = manifest.scenarios.map(scenario => scenario.id)
        expect(new Set(ids).size).toBe(ids.length)

        for (const scenario of manifest.scenarios) {
            expect(scenario.id).toBeTruthy()
            expect(scenario.title).toBeTruthy()
            expect(scenario.aiRole.length).toBeGreaterThan(5)
            expect(scenario.learnerRole.length).toBeGreaterThan(3)
            expect(scenario.objective.length).toBeGreaterThan(10)
            expect(scenario.context.length).toBeGreaterThan(10)
            expect(scenario.opening.length).toBeGreaterThan(10)
            expect(scenario.cefrLevel).toBeTruthy()
        }
    })

    it('speaking manifest topics are well-formed', () => {
        const manifest = load('speaking/manifest.json') as { topics: { id: string; steps: { kind: string; prompt: string }[] }[] }

        expect(manifest.topics.length).toBeGreaterThan(0)

        for (const topic of manifest.topics) {
            expect(topic.steps.length).toBeGreaterThan(0)

            for (const step of topic.steps) {
                expect(['repeat', 'open']).toContain(step.kind)
                expect(step.prompt).toBeTruthy()
            }
        }
    })
})
