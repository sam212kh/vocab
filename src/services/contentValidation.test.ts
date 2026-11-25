import { describe, expect, it } from 'vitest'

import { bandsOf, deriveObjectiveId, objectivesOf, summarizeIssues, validateContent } from './contentValidation'
import type { RepoContent } from './contentValidation'

const exercise = (over: Record<string, unknown> = {}) => ({
    id: 'ex-1', type: 'fill-blank', skill: 'vocabulary', cefrLevel: 'A2', before: 'Could you', after: 'me?', acceptedAnswers: ['help'],
    explanation: 'e', explanationPersian: 'توضیح', objectiveId: 'ask-help', targets: ['Could you help me?'], ...over,
})

/** The smallest repository that passes every rule. Tests break one thing at a time. */
function valid(): RepoContent {
    const emptyManifest = (key: string) => ({ version: 1, [key]: [] })

    return {
        json: {
            'manifest.json': { version: 1, courses: [{ id: 'c', lessons: [{ id: 'l1', file: './l1.json' }] }] },
            'l1.json': [{ word: 'help', meaning: 'کمک', pos: 'verb', examples: [{ english: 'Help me.', persian: 'کمکم کن.' }] }],
            'grammar/manifest.json': emptyManifest('topics'),
            'listening/manifest.json': emptyManifest('activities'),
            'reading/manifest.json': emptyManifest('passages'),
            'real-life/manifest.json': {
                version: 1,
                scenarios: [{
                    id: 'asking-for-help', title: 'Asking for help', titlePersian: 'کمک خواستن', cefrLevel: 'A2', skillTags: ['vocabulary'], difficulty: 1, estimatedDuration: 10,
                    learningObjectives: [{ id: 'ask-help', text: 'Ask politely for help', textPersian: 'مودبانه کمک بخواه' }], file: './asking-for-help.json',
                }],
            },
            'real-life/asking-for-help.json': {
                id: 'asking-for-help', context: 'c', contextPersian: 'ک',
                expressions: Array.from({ length: 6 }, (_, i) => ({ english: i === 0 ? 'Could you help me?' : i === 1 ? 'Could you repeat that?' : `phrase ${i}`, persian: 'عبارت', example: 'Could you help me?', examplePersian: 'می‌شود کمک کنی؟' })),
                exercises: [exercise()],
                speakingTask: { instruction: 'i', instructionPersian: 'ا', modelSentences: ['Could you help me?'] },
                roleplay: { aiRole: 'a', learnerRole: 'l', objective: 'o', context: 'c', opening: 'Hi', vocabulary: [] },
            },
            'speaking/manifest.json': { version: 1, topics: [{ id: 's', cefrLevel: 'A2', steps: [{ kind: 'repeat', prompt: 'Hi.', promptPersian: 'سلام' }, { kind: 'open', prompt: 'Why?', promptPersian: 'چرا؟' }] }] },
            'writing/manifest.json': { version: 1, prompts: [{ id: 'w', cefrLevel: 'A2', instructions: 'Write.', instructionsPersian: 'بنویس.' }] },
            'conversation/scenarios.json': { version: 1, scenarios: [{ id: 'c', cefrLevel: 'A2', opening: 'Hi', objective: 'o' }] },
            'transfer/patterns.json': {
                version: 1,
                patterns: [{
                    id: 'p', title: 'Requests', titlePersian: 'درخواست', frame: 'Could you …?', explanation: 'e', explanationPersian: 'ت', example: 'Could you help me?', examplePersian: 'م',
                    matches: ['\\bcould you\\b'],
                    contexts: [1, 1, 2, 2, 3].map((level, i) => ({ id: `c${i}`, level, situation: 'You are stuck at a station.', situationPersian: 'ایستگاه', goal: 'Ask a stranger for help.', goalPersian: 'کمک بخواه', references: ['Excuse me, can you help?', 'Sorry, I need some help.'], feedback: 'f', feedbackPersian: 'ب' })),
                }],
            },
        },
    }
}

const codes = (content: RepoContent, severity?: string) => validateContent(content).filter(issue => !severity || issue.severity === severity).map(issue => issue.code)
const mutate = (apply: (json: Record<string, any>) => void) => {
    const content = valid()

    apply(content.json)

    return content
}
const topic = (json: Record<string, any>) => json['real-life/asking-for-help.json']

describe('helpers', () => {
    it('bandsOf expands ranges and rejects unknown labels', () => {
        expect(bandsOf('A2-B1')).toEqual(['A2', 'B1'])
        expect(bandsOf('Intermediate')).toEqual([])
        expect(bandsOf(undefined)).toEqual([])
    })

    it('legacy string objectives get a stable derived id; explicit ones keep theirs', () => {
        expect(deriveObjectiveId('Use the -s ending correctly with he/she/it')).toBe('use-the-s-ending-correctly-with-he-she-it')
        expect(objectivesOf({ learningObjectives: ['Choose between a and an', { id: 'x', text: 'X', textPersian: 'ایکس' }] }).map(o => [o.id, o.explicit])).toEqual([['choose-between-a-and-an', false], ['x', true]])
    })
})

describe('the baseline fixture', () => {
    it('has no errors and no warnings', () => {
        expect(validateContent(valid())).toEqual([])
    })
})

describe('manifest integrity', () => {
    it('a manifest entry pointing at a missing file is an error', () => {
        expect(codes(mutate(json => delete json['real-life/asking-for-help.json']), 'error')).toContain('manifest-ref-broken')
    })

    it('duplicate ids, bad CEFR labels and unknown skill tags are errors', () => {
        const content = mutate(json => {
            const entry = json['real-life/manifest.json'].scenarios[0]

            json['real-life/manifest.json'].scenarios.push({ ...entry })
            entry.cefrLevel = 'Intermediate'
            entry.skillTags = ['telepathy']
        })

        expect(codes(content, 'error')).toEqual(expect.arrayContaining(['manifest-id-duplicate', 'cefr-invalid', 'skill-tag-invalid']))
    })

    it('a topic file that is not in any manifest is reported as an orphan', () => {
        expect(codes(mutate(json => (json['real-life/extra.json'] = { id: 'extra' })), 'warning')).toContain('orphan-file')
    })

    it('a file id that disagrees with its manifest entry is an error', () => {
        expect(codes(mutate(json => (topic(json).id = 'other')), 'error')).toContain('topic-id-mismatch')
    })

    it('a topic with no learning objectives is an error', () => {
        expect(codes(mutate(json => (json['real-life/manifest.json'].scenarios[0].learningObjectives = [])), 'error')).toContain('objectives-missing')
    })

    it('a missing vocabulary lesson file is an error', () => {
        expect(codes(mutate(json => delete json['l1.json']), 'error')).toContain('manifest-ref-broken')
    })
})

describe('objective-to-exercise relationships', () => {
    it('an exercise pointing at an undeclared objective is an error', () => {
        expect(codes(mutate(json => (topic(json).exercises[0].objectiveId = 'nope')), 'error')).toContain('objective-unknown')
    })

    it('objective ids must be unique kebab-case', () => {
        const content = mutate(json => (json['real-life/manifest.json'].scenarios[0].learningObjectives = [{ id: 'A B', text: 'x', textPersian: 'ا' }, { id: 'a', text: 'y', textPersian: 'ا' }, { id: 'a', text: 'z', textPersian: 'ا' }]))

        expect(codes(content, 'error')).toEqual(expect.arrayContaining(['objective-id-invalid', 'objective-id-duplicate']))
    })

    it('a real-life target must be an expression the scenario actually teaches', () => {
        expect(codes(mutate(json => (topic(json).exercises[0].targets = ['Something never taught'])), 'error')).toContain('target-not-taught')
    })
})

describe('exercise structure', () => {
    it('duplicate exercise ids across topics are errors; identical prompts are warnings', () => {
        const content = mutate(json => {
            topic(json).exercises.push(exercise({ id: 'ex-1' }))
            topic(json).exercises.push(exercise({ id: 'ex-2' }))
        })

        expect(codes(content, 'error')).toContain('exercise-id-duplicate')
        expect(codes(content, 'warning')).toContain('exercise-duplicate')
    })

    it.each([
        ['empty accepted answers', { acceptedAnswers: [] }, 'accepted-answers-missing'],
        ['unknown type', { type: 'riddle' }, 'exercise-type-invalid'],
        ['unknown objective', { objectiveId: 'zzz' }, 'objective-unknown'],
        ['hint on a choice exercise', { type: 'multiple-choice', prompt: 'p', options: ['a', 'b'], correctIndex: 0, hint: 'h' }, 'hint-unsupported'],
        ['choice with duplicate options', { type: 'multiple-choice', prompt: 'p', options: ['a', 'A'], correctIndex: 0 }, 'options-duplicate'],
        ['choice with out-of-range answer', { type: 'multiple-choice', prompt: 'p', options: ['a', 'b'], correctIndex: 5 }, 'correct-index-invalid'],
        ['translation whose source is not Persian', { type: 'translation', source: 'Help me', sourceLang: 'fa', acceptedAnswers: ['a', 'b'] }, 'source-language-mismatch'],
        ['listening exercise without audio text', { type: 'listening-comprehension', prompt: 'p', options: ['a', 'b'], correctIndex: 0 }, 'audio-text-missing'],
        ['dictation without audio text', { type: 'dictation', acceptedAnswers: ['x'] }, 'audio-text-missing'],
        ['correction equal to the mistake', { type: 'grammar-correction', incorrectSentence: 'He go.', acceptedAnswers: ['he go'] }, 'correction-unchanged'],
        ['ordering with two segments', { type: 'sentence-ordering', segments: ['a', 'b'] }, 'segments-invalid'],
        ['commonError that also matches a correct answer', { commonErrors: [{ match: 'help', feedback: 'f', feedbackPersian: 'ب' }] }, 'common-error-matches-correct'],
        ['commonError with a broken pattern', { commonErrors: [{ match: '([x', feedback: 'f', feedbackPersian: 'ب' }] }, 'common-error-regex'],
        ['commonError without Persian', { commonErrors: [{ match: 'x', feedback: 'f', feedbackPersian: 'latin' }] }, 'common-error-invalid'],
        ['acceptableAnswer already accepted', { acceptableAnswers: [{ text: 'help', note: 'n' }] }, 'acceptable-answers-overlap'],
    ])('%s', (_name, over, code) => {
        expect(codes(mutate(json => (topic(json).exercises[0] = exercise(over as Record<string, unknown>))), 'error')).toContain(code)
    })

    it('missing Persian feedback and a single accepted wording are warnings, not errors', () => {
        const content = mutate(json => (topic(json).exercises[0] = exercise({ type: 'translation', source: 'کمک', sourceLang: 'fa', acceptedAnswers: ['Help'], explanationPersian: undefined, objectiveId: undefined, targets: undefined })))

        expect(codes(content, 'error')).toEqual([])
        expect(codes(content, 'warning')).toEqual(expect.arrayContaining(['few-alternatives', 'explanation-persian-missing']))
    })

    it('an exercise level outside the topic band is flagged', () => {
        expect(codes(mutate(json => (topic(json).exercises[0].cefrLevel = 'C1')), 'warning')).toContain('cefr-inconsistent')
    })
})

describe('Persian, examples and duplicates in teaching content', () => {
    it('an expression without Persian or example is an error', () => {
        const content = mutate(json => {
            topic(json).expressions[1].persian = 'only english'
            topic(json).expressions[2].example = ''
        })

        expect(codes(content, 'error')).toEqual(expect.arrayContaining(['persian-missing', 'example-missing']))
    })

    it('an expression taught twice in one scenario is an error; across scenarios a warning', () => {
        expect(codes(mutate(json => (topic(json).expressions[3].english = 'phrase 2')), 'error')).toContain('expression-duplicate')

        const content = mutate(json => {
            json['real-life/manifest.json'].scenarios.push({ ...json['real-life/manifest.json'].scenarios[0], id: 'second', file: './second.json' })
            json['real-life/second.json'] = { ...topic(json), id: 'second', exercises: [] }
        })

        expect(codes(content, 'warning')).toContain('expression-duplicate-across')
    })
})

describe('vocabulary and Cloze content quality', () => {
    it('an example whose Persian still contains the English headword is an error', () => {
        const content = mutate(json => (json['l1.json'][0].examples = [{ english: 'Help me.', persian: 'لطفاً به من help کن.' }]))

        expect(codes(content, 'error')).toContain('example-headword-untranslated')
    })

    it('an example with no Persian translation is an error', () => {
        const content = mutate(json => (json['l1.json'][0].examples = [{ english: 'Help me.', persian: '' }]))

        expect(codes(content, 'error')).toContain('example-persian-missing')
    })

    it('an example whose sentence never contains the headword leaves the word unreachable by Cloze', () => {
        const content = mutate(json => (json['l1.json'][0].examples = [{ english: 'Could you assist me?', persian: 'می‌توانی به من کمک کنی؟' }]))

        expect(codes(content, 'warning')).toContain('cloze-unreachable')
    })

    it('a word that repeats the same example sentence twice is a warning', () => {
        const content = mutate(json => (json['l1.json'][0].examples = [
            { english: 'Help me.', persian: 'کمکم کن.' },
            { english: 'Help me.', persian: 'کمکم کن.' },
        ]))

        expect(codes(content, 'warning')).toContain('example-duplicate-within-word')
    })

    it('a word with no part of speech is a warning', () => {
        const content = mutate(json => delete json['l1.json'][0].pos)

        expect(codes(content, 'warning')).toContain('pos-missing')
    })

    it('an authored clozeVariant that matches the example avoids a false cloze-unreachable warning', () => {
        const content = mutate(json => {
            json['l1.json'][0].word = 'defer'
            json['l1.json'][0].clozeVariants = ['deferred']
            json['l1.json'][0].examples = [{ english: 'The decision was deferred until next week.', persian: 'تصمیم تا هفته آینده به تعویق افتاد.' }]
        })

        expect(codes(content, 'warning')).not.toContain('cloze-unreachable')
    })

    it('a placeholder headword (sth/sb/slash alternatives) is never flagged as cloze-unreachable', () => {
        const content = mutate(json => {
            json['l1.json'][0].word = 'tell sb sth'
            json['l1.json'][0].examples = [{ english: 'She told him the news gently.', persian: 'او خبر را با ملایمت به او گفت.' }]
        })

        expect(codes(content, 'warning')).not.toContain('cloze-unreachable')
    })

    it('the same recycled sentence shape reused across three or more words is an error', () => {
        const content = mutate(json => {
            json['l1.json'] = [
                { word: 'help', meaning: 'کمک', pos: 'verb', examples: [{ english: 'The team discussed help before deciding what to do next.', persian: 'تیم درباره کمک تصمیم گرفت.' }] },
                { word: 'trust', meaning: 'اعتماد', pos: 'verb', examples: [{ english: 'The team discussed trust before deciding what to do next.', persian: 'تیم درباره اعتماد تصمیم گرفت.' }] },
                { word: 'budget', meaning: 'بودجه', pos: 'noun', examples: [{ english: 'The team discussed budget before deciding what to do next.', persian: 'تیم درباره بودجه تصمیم گرفت.' }] },
            ]
        })

        expect(codes(content, 'error')).toContain('example-template-repeated')
    })
})

describe('audio configuration', () => {
    const listening = (file: Record<string, unknown>, kind = 'dialogue') => mutate(json => {
        json['listening/manifest.json'].activities.push({ id: 'l', title: 'L', kind, cefrLevel: 'A2', skillTags: ['listening'], difficulty: 1, estimatedDuration: 5, learningObjectives: ['Follow it'], file: './l.json' })
        json['listening/l.json'] = { id: 'l', scenario: 's', lines: [{ speaker: 'A', english: 'Hi.', persian: 'سلام' }], exercises: [], ...file }
    })

    it('a dialogue without lines has nothing to speak', () => {
        expect(codes(listening({ lines: [] }), 'error')).toContain('audio-lines-missing')
    })

    it('a dictation-only "sentences" activity is fine without lines when every exercise has audio', () => {
        const dictation = { id: 'd', type: 'dictation', skill: 'listening', cefrLevel: 'A2', audioText: 'See you soon.', acceptedAnswers: ['See you soon.'] }

        expect(codes(listening({ lines: [], exercises: [dictation] }, 'sentences'), 'error')).toEqual([])
    })

    it('a line with no english text is an error', () => {
        expect(codes(listening({ lines: [{ speaker: 'A', persian: 'سلام' }] }), 'error')).toContain('audio-line-empty')
    })
})

describe('transfer patterns', () => {
    const patterns = (json: Record<string, any>) => json['transfer/patterns.json'].patterns

    it('a pattern no taught expression matches can never be reached', () => {
        expect(codes(mutate(json => (patterns(json)[0].matches = ['\\bnever said\\b'])), 'error')).toContain('pattern-unreachable')
    })

    it('needs five situations, Persian, reference answers and valid regexes', () => {
        const content = mutate(json => {
            patterns(json)[0].contexts.pop()
            patterns(json)[0].contexts[0].situationPersian = ''
            patterns(json)[0].contexts[1].references = []
            patterns(json)[0].matches.push('([x')
        })

        expect(codes(content, 'error')).toEqual(expect.arrayContaining(['pattern-few-contexts', 'persian-missing', 'context-references-missing', 'pattern-regex']))
    })

    it('a situation that already contains the pattern wording gives the answer away', () => {
        expect(codes(mutate(json => (patterns(json)[0].contexts[0].goal = 'Ask: could you help me?')), 'error')).toContain('context-gives-away-pattern')
    })

    it('flat difficulty and missing contextual feedback are warnings', () => {
        const content = mutate(json => patterns(json)[0].contexts.forEach((context: any) => { context.level = 1; delete context.feedback }))
        const warnings = codes(content, 'warning')

        expect(warnings).toEqual(expect.arrayContaining(['pattern-flat-difficulty', 'context-feedback-missing']))
    })
})

describe('summary', () => {
    it('counts errors and warnings per code', () => {
        const summary = summarizeIssues(validateContent(mutate(json => { topic(json).exercises[0].acceptedAnswers = []; delete json['l1.json'] })))

        expect(summary.errors).toBeGreaterThanOrEqual(2)
        expect(summary.byCode[0].severity).toBe('error')
    })
})
