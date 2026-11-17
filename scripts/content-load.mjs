import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Parses every JSON file under public/data into { 'real-life/manifest.json': {...}, ... }. Unparseable files become `null`. */
export function loadRepoContent(root = 'public/data') {
    const json = {}

    const walk = dir => {
        for (const name of readdirSync(dir).sort()) {
            const path = join(dir, name)

            if (statSync(path).isDirectory()) walk(path)
            else if (name.endsWith('.json')) {
                try {
                    json[relative(root, path).split('\\').join('/')] = JSON.parse(readFileSync(path, 'utf8'))
                } catch {
                    json[relative(root, path).split('\\').join('/')] = null
                }
            }
        }
    }

    walk(root)

    return { json }
}
