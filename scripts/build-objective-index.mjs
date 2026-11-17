// Usage: node scripts/build-objective-index.mjs [--check]
// Generates public/data/objectives-index.json from the topic manifests and exercises.
// --check fails (exit 1) when the committed file is out of date instead of writing it.
import { readFileSync, writeFileSync } from 'node:fs'

import { objectiveIndex } from '../src/services/contentCoverage.ts'
import { loadRepoContent } from './content-load.mjs'

const OUT = 'public/data/objectives-index.json'
const body = JSON.stringify({ version: 1, objectives: objectiveIndex(loadRepoContent()) }, null, 1) + '\n'

if (process.argv.includes('--check')) {
    let current = ''

    try {
        current = readFileSync(OUT, 'utf8')
    } catch { /* missing counts as out of date */ }

    if (current !== body) {
        console.error(`${OUT} is out of date. Run: npm run build:objectives`)
        process.exit(1)
    }

    console.log(`${OUT} is up to date`)
} else {
    writeFileSync(OUT, body)
    console.log(`wrote ${OUT}`)
}
