import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The download route (and the in-app update banner) point at a stable
// "latest release" URL. GitHub only resolves that when the newest release
// carries an asset with a fixed name, so every release uploads the installer
// twice: once under its versioned name (archive) and once as STABLE_ASSET.
const STABLE_ASSET = 'T365-Desk-Setup.exe'
const REPO = 'kifscrypto/Trading365'

const file = process.argv[2]
const tag = process.argv[3] ?? 't365-desk-v1.1.2'
if (!file) {
  console.error('Usage: node scripts/upload-desk-release.mjs /path/to/T365-Desk-Setup-x.y.z.exe [release-tag]')
  process.exit(1)
}

const staging = mkdtempSync(path.join(tmpdir(), 't365-desk-'))
const stablePath = path.join(staging, STABLE_ASSET)
copyFileSync(file, stablePath)

execFileSync('gh', ['release', 'upload', tag, file, '--clobber'], { stdio: 'inherit' })
execFileSync('gh', ['release', 'upload', tag, stablePath, '--clobber'], { stdio: 'inherit' })
execFileSync('gh', ['release', 'edit', tag, '--latest'], { stdio: 'inherit' })

console.log(`Installer uploaded to the ${tag} release and marked latest.`)
console.log(`Stable download URL: https://github.com/${REPO}/releases/latest/download/${STABLE_ASSET}`)
