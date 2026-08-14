// Builds the trading365-ops dashboard (Vite) and bakes the static output into
// this repo at public/ops/, where the Next.js app serves it at /ops behind the
// admin_auth middleware guard.
//
// Usage:  node scripts/sync-ops.mjs [path-to-ops-repo]
//         OPS_REPO=/path/to/trading365-ops node scripts/sync-ops.mjs
//
// Default repo location: ../trading365-ops (sibling directory).

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const opsRepo = resolve(process.argv[2] ?? process.env.OPS_REPO ?? resolve(repoRoot, 'trading365-ops'))
const target = resolve(repoRoot, 'public/ops')

if (!existsSync(resolve(opsRepo, 'package.json'))) {
  console.error(`Ops repo not found at ${opsRepo} — pass its path as an argument or set OPS_REPO.`)
  process.exit(1)
}

console.log(`Building ops dashboard in ${opsRepo} (base=/ops/)...`)
execFileSync('npm', ['run', 'build', '--', '--base=/ops/'], { cwd: opsRepo, stdio: 'inherit', shell: true })

console.log(`Copying dist → ${target}`)
rmSync(target, { recursive: true, force: true })
cpSync(resolve(opsRepo, 'dist'), target, { recursive: true })

console.log('Done. Commit public/ops/ to deploy with the site.')
