import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The download route (and the in-app update banner) point at a stable
// "latest release" URL. GitHub only resolves that when the newest release
// carries an asset with a fixed name, so every release uploads the installer
// as: its versioned name (archive), STABLE_ASSET (current), and LEGACY_ASSET
// (the pre-rename name, so old links and cached URLs keep working).
const STABLE_ASSET = 'T365-Terminal-Setup.exe'
const LEGACY_ASSET = 'T365-Desk-Setup.exe'
const REPO = 'kifscrypto/Trading365'

const file = process.argv[2]
const tag = process.argv[3]
if (!file || !tag) {
  console.error('Usage: node scripts/upload-desk-release.mjs /path/to/T365-Terminal-Setup-x.y.z.exe <release-tag>')
  process.exit(1)
}

const staging = mkdtempSync(path.join(tmpdir(), 't365-terminal-'))
const stablePath = path.join(staging, STABLE_ASSET)
const legacyPath = path.join(staging, LEGACY_ASSET)
copyFileSync(file, stablePath)
copyFileSync(file, legacyPath)

for (const asset of [file, stablePath, legacyPath]) {
  execFileSync('gh', ['release', 'upload', tag, asset, '--clobber'], { stdio: 'inherit' })
}
execFileSync('gh', ['release', 'edit', tag, '--latest'], { stdio: 'inherit' })

console.log(`Installer uploaded to the ${tag} release and marked latest.`)
console.log(`Stable download URL: https://github.com/${REPO}/releases/latest/download/${STABLE_ASSET}`)
