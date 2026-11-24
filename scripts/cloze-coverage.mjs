import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/manifest.json'), 'utf8'))

function cleanHeadword(value) {
  return String(value ?? '').replace(/\s*\([^)]*\)/g, '').trim()
}

function normalize(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[’ʻʼ]/gu, "'")
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function pattern(value) {
  const parts = normalize(value).split(' ')
  const body = parts
    .map(part => escape(part)
      .replace(/['’ʻʼ]/gu, "['’ʻʼ]")
      .replace(/[-‐‑‒–—]/gu, '[-‐‑‒–—]'))
    .join('\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu')
}

function findMatch(sentence, phrases) {
  let best = null
  for (const candidate of phrases) {
    const phrase = normalize(candidate)
    if (!phrase) continue
    const match = pattern(phrase).exec(sentence)
    if (match && (!best || match[0].length > best.text.length)) {
      best = { text: match[0], phrase }
    }
  }
  return best
}

function rawExample(value) {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value?.english ?? '')
}

function exclusionReason(word, examples, matched) {
  if (matched) return null
  const headword = cleanHeadword(word.word)
  if (/\b(?:sth|sb|sbs|someone|something)\b|\/|\betc\.?$/iu.test(headword)) {
    return 'headword contains a learner substitution marker or alternatives'
  }
  if (examples.length === 0) return 'no English example'
  if (Array.isArray(word.clozeVariants) && word.clozeVariants.length) return 'configured variants did not occur'
  return 'requires an explicit inflection or spelling variant'
}

const courses = []
for (const course of manifest.courses) {
  const stats = { course: course.id, files: course.lessons.length, total: 0, eligible: 0, matched: 0, unreachable: 0, intentionallyExcluded: 0, ambiguous: 0, examples: 0, unreachableSample: [] }
  for (const lesson of course.lessons) {
    const file = path.join(root, 'public/data', lesson.file.replace(/^\.\//u, ''))
    const words = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const word of words) {
      stats.total++
      const examples = Array.isArray(word.examples) ? word.examples.map(rawExample).filter(Boolean) : []
      stats.examples += examples.length
      const headword = cleanHeadword(word.word)
      const candidates = [headword, ...(Array.isArray(word.clozeVariants) ? word.clozeVariants : [])]
      const matches = examples.map(sentence => findMatch(sentence, candidates)).filter(Boolean)
      const matched = matches.length > 0
      const excluded = exclusionReason(word, examples, matched)
      if (matched) {
        stats.matched++
        stats.eligible++
        if (matches.length > 1 && new Set(matches.map(item => item.text.toLowerCase())).size > 1) stats.ambiguous++
      } else if (excluded?.startsWith('headword contains')) {
        stats.intentionallyExcluded++
      } else {
        stats.unreachable++
        if (stats.unreachableSample.length < 12) stats.unreachableSample.push({ word: headword, reason: excluded, example: examples[0] ?? '' })
      }
    }
  }
  courses.push(stats)
}

const total = courses.reduce((sum, row) => sum + row.total, 0)
const matched = courses.reduce((sum, row) => sum + row.matched, 0)
const unreachable = courses.reduce((sum, row) => sum + row.unreachable, 0)
const intentionallyExcluded = courses.reduce((sum, row) => sum + row.intentionallyExcluded, 0)
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), total, eligible: matched, matched, unreachable, intentionallyExcluded, courses }, null, 2))
