// Usage: node scripts/validate-content.mjs [--warnings] [--json]
// Exit code 1 when any error is found. Warnings never fail the run.
import { summarizeIssues, validateContent } from '../src/services/contentValidation.ts'
import { loadRepoContent } from './content-load.mjs'

const issues = validateContent(loadRepoContent())
const summary = summarizeIssues(issues)
const showWarnings = process.argv.includes('--warnings')

if (process.argv.includes('--json')) console.log(JSON.stringify({ summary, issues }, null, 2))
else {
    for (const issue of issues) if (issue.severity === 'error' || showWarnings) console.log(`${issue.severity.toUpperCase().padEnd(7)} ${issue.code.padEnd(28)} ${issue.path}  ${issue.message}`)

    console.log(`\n${summary.errors} error(s), ${summary.warnings} warning(s)`)
    for (const row of summary.byCode) console.log(`  ${row.severity.padEnd(7)} ${String(row.count).padStart(5)}  ${row.code}`)
}

process.exit(summary.errors ? 1 : 0)
