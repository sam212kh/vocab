import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeItem, scoreAnswer } from './scoring.mjs'
import { CEFR_LADDER } from './engine.mjs'

/**
 * Content-integrity suite for the pilot assessment banks. Structural
 * checks + every canonical answer round-tripped through the REAL
 * server-side scoring + answer-key leak checks.
 */

const here = dirname(fileURLToPath(import.meta.url))
const banksDir = join(here, 'banks')
const projectRoot = join(here, '..', '..')

const PILOT_SKILLS = ['grammar', 'vocabulary']
const PILOT_LEVELS = ['A1', 'A2', 'B1', 'B2']
const MIN_ITEMS_PER_LEVEL = 12
const MIN_TYPES_PER_LEVEL = 3

const TEXT_TYPES = new Set(['fill-blank', 'translation', 'short-answer', 'dictation', 'grammar-correction'])
const CHOICE_TYPES = new Set(['multiple-choice', 'listening-comprehension', 'reading-comprehension'])
const VALID_TYPES = new Set([...TEXT_TYPES, ...CHOICE_TYPES, 'sentence-ordering', 'matching'])

function loadBank(skill) {
  return JSON.parse(readFileSync(join(banksDir, `${skill}.json`), 'utf-8'))
}

const banks = Object.fromEntries(PILOT_SKILLS.map(skill => [skill, loadBank(skill)]))

test('banks live server-side, never under public/ or src/', () => {
  assert.ok(!banksDir.includes(`${join('public')}${'/'}`), 'banks must not be under public/')

  for (const skill of PILOT_SKILLS) {
    assert.ok(!existsSync(join(projectRoot, 'public', 'data', 'assessment', `${skill}.json`)))
    assert.ok(!existsSync(join(projectRoot, 'src', 'data', 'assessment', `${skill}.json`)))
  }
})

test('every item has required, well-formed metadata', () => {
  for (const skill of PILOT_SKILLS) {
    for (const item of banks[skill].items) {
      const label = `${skill}/${item.id}`

      assert.ok(typeof item.id === 'string' && item.id.length > 3, `${label}: id`)
      assert.equal(item.skill, skill, `${label}: skill`)
      assert.ok(CEFR_LADDER.includes(item.cefrLevel), `${label}: single valid cefrLevel`)
      assert.ok(VALID_TYPES.has(item.type), `${label}: valid type`)
      assert.ok(Number.isInteger(item.difficulty) && item.difficulty >= 1 && item.difficulty <= 5, `${label}: difficulty 1-5`)
      assert.ok(typeof item.topic === 'string' && item.topic.length > 2, `${label}: topic`)
      assert.ok(typeof item.explanation === 'string' && item.explanation.length > 5, `${label}: explanation`)
      assert.ok(typeof item.explanationPersian === 'string' && item.explanationPersian.length > 3, `${label}: Persian explanation`)
      assert.ok(/[؀-ۿ]/.test(item.explanationPersian), `${label}: Persian explanation contains Persian script`)

      if (CHOICE_TYPES.has(item.type)) {
        assert.ok(item.options.length >= 3, `${label}: >=3 options`)
        assert.ok(Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < item.options.length, `${label}: correctIndex in range`)
        assert.equal(new Set(item.options).size, item.options.length, `${label}: options unique`)
        assert.ok(item.prompt.length > 5, `${label}: prompt`)
      }

      if (TEXT_TYPES.has(item.type)) {
        assert.ok(Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length > 0, `${label}: acceptedAnswers`)
        assert.ok(item.acceptedAnswers.every(answer => typeof answer === 'string' && answer.trim()), `${label}: non-empty answers`)
      }

      if (item.type === 'sentence-ordering') {
        assert.ok(item.segments.length >= 4, `${label}: >=4 segments`)
      }

      if (item.type === 'matching') {
        assert.ok(item.pairs.length >= 3, `${label}: >=3 pairs`)
      }
    }
  }
})

test('ids are globally unique', () => {
  const ids = PILOT_SKILLS.flatMap(skill => banks[skill].items.map(item => item.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('minimum item counts and exercise-type diversity per skill and level', () => {
  for (const skill of PILOT_SKILLS) {
    for (const level of PILOT_LEVELS) {
      const atLevel = banks[skill].items.filter(item => item.cefrLevel === level)

      assert.ok(atLevel.length >= MIN_ITEMS_PER_LEVEL, `${skill}/${level}: ${atLevel.length} items, need ${MIN_ITEMS_PER_LEVEL}`)

      const types = new Set(atLevel.map(item => item.type))
      assert.ok(types.size >= MIN_TYPES_PER_LEVEL, `${skill}/${level}: ${types.size} types, need ${MIN_TYPES_PER_LEVEL}`)
    }
  }
})

test('no duplicated or trivially similar questions within a bank', () => {
  for (const skill of PILOT_SKILLS) {
    const keys = new Set()

    for (const item of banks[skill].items) {
      const text = (item.prompt ?? item.incorrectSentence ?? `${item.before ?? ''} ${item.after ?? ''}` ?? '') +
        (item.segments?.join(' ') ?? '') + (item.pairs?.map(pair => pair.left).join(' ') ?? '')

      const key = text.toLowerCase().replace(/[^a-z0-9]/g, '')

      assert.ok(key.length > 5, `${skill}/${item.id}: empty question text`)
      assert.ok(!keys.has(key), `${skill}/${item.id}: duplicate question text`)
      keys.add(key)
    }
  }
})

test('every canonical answer passes the real server-side scoring', () => {
  for (const skill of PILOT_SKILLS) {
    for (const item of banks[skill].items) {
      const label = `${skill}/${item.id}`
      const { presentation } = sanitizeItem(item, 'validation-session')

      let answer

      if (CHOICE_TYPES.has(item.type)) {
        answer = { kind: 'choice', index: item.correctIndex }
      } else if (TEXT_TYPES.has(item.type)) {
        for (const accepted of item.acceptedAnswers) {
          assert.equal(
            scoreAnswer(item, { kind: 'text', text: accepted }, presentation).correct,
            true,
            `${label}: accepted answer "${accepted}" rejected`
          )
        }
        continue
      } else if (item.type === 'sentence-ordering') {
        /* canonical order expressed in displayed indexes */
        const map = presentation.segmentOrder
        const displayedForCanonical = item.segments.map((_, canonicalIndex) => map.indexOf(canonicalIndex))
        answer = { kind: 'ordering', order: displayedForCanonical }
      } else if (item.type === 'matching') {
        const map = presentation.rightOrder
        answer = {
          kind: 'matching',
          matches: item.pairs.map((_, leftIndex) => ({ leftIndex, rightIndex: map.indexOf(leftIndex) })),
        }
      }

      assert.equal(scoreAnswer(item, answer, presentation).correct, true, `${label}: canonical answer rejected`)
    }
  }
})

test('wrong answers are rejected (scoring is not trivially lenient)', () => {
  for (const skill of PILOT_SKILLS) {
    for (const item of banks[skill].items) {
      const label = `${skill}/${item.id}`

      if (CHOICE_TYPES.has(item.type)) {
        const wrongIndex = (item.correctIndex + 1) % item.options.length
        assert.equal(scoreAnswer(item, { kind: 'choice', index: wrongIndex }).correct, false, label)
      }

      if (TEXT_TYPES.has(item.type)) {
        assert.equal(
          scoreAnswer(item, { kind: 'text', text: 'completely unrelated answer zzz' }).correct,
          false,
          label
        )
      }
    }
  }
})

test('typo-tolerance guard: known real-word 1-edit neighbours are rejected via exactMatch', () => {
  const commuter = banks.vocabulary.items.find(item => item.id === 'vo-b1-011')
  assert.equal(scoreAnswer(commuter, { kind: 'text', text: 'computer' }).correct, false, 'computer must not score as commuter')

  const blue = banks.vocabulary.items.find(item => item.id === 'vo-a1-011')
  assert.equal(scoreAnswer(blue, { kind: 'text', text: 'glue' }).correct, false, 'glue must not score as blue')
})

test('sanitized items never contain answer keys', () => {
  for (const skill of PILOT_SKILLS) {
    for (const item of banks[skill].items) {
      const { item: sanitized } = sanitizeItem(item, 'leak-check-session')

      assert.ok(!('acceptedAnswers' in sanitized), `${item.id}: acceptedAnswers leaked`)
      assert.ok(!('correctIndex' in sanitized), `${item.id}: correctIndex leaked`)
      assert.ok(!('pairs' in sanitized), `${item.id}: aligned pairs leaked`)
      assert.ok(!('explanation' in sanitized) && !('explanationPersian' in sanitized), `${item.id}: explanations leak before answering`)

      /* text answers of 5+ chars must not appear in the sanitized VALUES
       * (keys like the fill-blank field "after" are not content; short
       * function words like "to"/"on" legitimately appear in prompts) */
      const visibleText = Object.values(sanitized)
        .flat()
        .filter(value => typeof value === 'string')
        .join(' ')
        .toLowerCase()

      if (TEXT_TYPES.has(item.type)) {
        for (const answer of item.acceptedAnswers) {
          if (answer.length >= 5 && item.type !== 'grammar-correction') {
            assert.ok(
              !visibleText.includes(answer.toLowerCase()),
              `${item.id}: answer "${answer}" visible in sanitized item`
            )
          }
        }
      }

      if (item.type === 'matching') {
        const rights = item.pairs.map(pair => pair.right)
        assert.deepEqual([...sanitized.pairsRight].sort(), [...rights].sort(), `${item.id}: same right-side set`)
        assert.notDeepEqual(sanitized.pairsRight, rights, `${item.id}: right side must be shuffled`)
      }
    }
  }
})

test('sentence-ordering is served shuffled (not in canonical order)', () => {
  for (const skill of PILOT_SKILLS) {
    for (const item of banks[skill].items.filter(entry => entry.type === 'sentence-ordering')) {
      const { item: sanitized } = sanitizeItem(item, 'shuffle-check-session')
      assert.notDeepEqual(sanitized.segments, item.segments, `${item.id}: segments served in canonical order`)
    }
  }
})

test('no bank content is referenced from frontend source', () => {
  const srcDir = join(projectRoot, 'src')

  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  )

  /* Only actual import/fetch statements count — doc comments that MENTION
   * the server-side path are fine. */
  const offenders = walk(srcDir).filter(file =>
    /\.(ts|vue|mjs|js)$/.test(file) &&
    /(from\s+['"][^'"]*assessment\/banks|fetch\([^)]*assessment\/banks)/.test(readFileSync(file, 'utf-8'))
  )

  assert.deepEqual(offenders, [], 'frontend source must not import or fetch assessment banks')
})
