import { execFileSync } from 'node:child_process'

const file = process.argv[2]
const tag = process.argv[3] ?? 't365-desk-v1.1.0'
if (!file) {
  console.error('Usage: node scripts/upload-desk-release.mjs /path/to/T365-Desk-Setup.exe [release-tag]')
  process.exit(1)
}

execFileSync('gh', ['release', 'upload', tag, file, '--clobber'], { stdio: 'inherit' })
console.log(`Installer uploaded to the ${tag} GitHub release.`)
