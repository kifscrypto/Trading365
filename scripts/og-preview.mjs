// Offline harness for the social cards.
//
// The dev server cannot run on this machine (Turbopack's cache inside a
// OneDrive-synced folder), so OG cards were previously only ever inspected on
// the deployed site. This renders the very same card component through the
// very same renderer Next uses (`next/og` wraps the bundled @vercel/og) and
// writes PNGs to .og-preview/, so the design can be checked at pixel level
// before a deploy.
//
//   node scripts/og-preview.mjs                # every fixture
//   node scripts/og-preview.mjs winner sl     # only these
//
// The component source is transpiled on the fly with the local TypeScript
// compiler into .og-preview/build/ (CommonJS, so plain node can require it).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outDir = path.join(root, '.og-preview')
const buildDir = path.join(outDir, 'build')

// ── Fixtures: one per card state we can publish ─────────────────────────────
const FIXTURES = {
  winner: {
    symbol: 'MARSC',
    side: 'short',
    exchangeTimeframe: 'WEEX · 4H',
    firedText: '17 Sep 2026 · 03:45 UTC',
    entryText: '0.101000',
    stopText: '0.105040',
    riskText: '4.0%',
    heldText: '2h 14m',
    reached: 1,
    total: 5,
    tone: 'win',
    outcomeLabel: 'TP1 HIT',
    outcomeDetail: 'Target 1 of 5 reached · closed at TP1',
    moveText: '+1.5%',
    url: 'trading365.org/signals/marsc-short-20260917-0345',
  },
  bigWinner: {
    symbol: 'FARTCOIN',
    side: 'long',
    exchangeTimeframe: 'BYBIT · 15M',
    firedText: '17 Sep 2026 · 09:01 UTC',
    entryText: '1.234500',
    stopText: '1.180000',
    riskText: '4.4%',
    heldText: '6h 02m',
    reached: 3,
    total: 3,
    tone: 'win',
    outcomeLabel: 'TP3 HIT',
    outcomeDetail: 'All 3 targets reached · closed at TP3',
    moveText: '+4.0%',
    url: 'trading365.org/signals/fartcoin-long-20260917-0901',
  },
  stopped: {
    symbol: 'BTW',
    side: 'short',
    exchangeTimeframe: 'MEXC · 1H',
    firedText: '17 Sep 2026 · 11:15 UTC',
    entryText: '0.041200',
    stopText: '0.043000',
    riskText: '4.4%',
    heldText: '48m',
    reached: 0,
    total: 5,
    tone: 'loss',
    outcomeLabel: 'STOPPED OUT',
    outcomeDetail: 'Invalidation level hit before any target',
    moveText: '-4.4%',
    url: 'trading365.org/signals/btw-short-20260917-1115',
  },
  expired: {
    symbol: 'SOL',
    side: 'long',
    exchangeTimeframe: 'OKX · 4H',
    firedText: '15 Sep 2026 · 02:00 UTC',
    entryText: '214.400',
    stopText: '206.100',
    riskText: '3.9%',
    heldText: '48h 00m',
    reached: 0,
    total: 3,
    tone: 'flat',
    outcomeLabel: 'NO TARGET IN 48H',
    outcomeDetail: 'Window closed with neither level touched',
    moveText: '—',
    url: 'trading365.org/signals/sol-long-20260915-0200',
  },
  longSymbol: {
    symbol: '1000PEPE',
    side: 'short',
    exchangeTimeframe: 'GATE · 1D',
    firedText: '17 Sep 2026 · 00:00 UTC',
    entryText: '0.0000123',
    stopText: '0.0000129',
    riskText: '4.9%',
    heldText: '19h 40m',
    reached: 2,
    total: 5,
    tone: 'win',
    outcomeLabel: 'TP2 HIT',
    outcomeDetail: 'Target 2 of 5 reached · closed at TP2',
    moveText: '+2.5%',
    url: 'trading365.org/signals/1000pepe-short-20260917-0000',
  },
  generic: {
    symbol: '',
    side: '',
    exchangeTimeframe: '',
    firedText: '',
    entryText: '',
    stopText: '',
    riskText: '',
    heldText: '',
    reached: 0,
    total: 0,
    tone: 'flat',
    outcomeLabel: '',
    outcomeDetail: '',
    moveText: '',
    url: 'trading365.org/signals',
  },
}

function build() {
  fs.mkdirSync(buildDir, { recursive: true })
  // Run the compiler directly through node rather than `npx tsc`: spawning a
  // .cmd shim needs a shell on Windows and EINVALs without one.
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      path.join('lib', 'og', 'signal-card.tsx'),
      '--jsx', 'react-jsx',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--target', 'es2022',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir', path.relative(root, buildDir),
    ],
    { cwd: root, stdio: 'inherit' },
  )
}

// Real font faces, read from disk exactly like the route does. Without them
// Satori falls back to the single regular face bundled with @vercel/og, every
// `fontWeight: 700` is silently ignored, and the card reads as flat.
function loadFonts() {
  const dir = path.join(root, 'assets', 'fonts')
  const faces = [
    { file: 'NotoSans-Regular.ttf', weight: 400 },
    { file: 'NotoSans-Bold.ttf', weight: 700 },
  ]
  return faces
    .filter((f) => fs.existsSync(path.join(dir, f.file)))
    .map((f) => ({ name: 'Noto Sans', data: fs.readFileSync(path.join(dir, f.file)), weight: f.weight, style: 'normal' }))
}

async function main() {
  build()
  const { ImageResponse } = require(path.join(root, 'node_modules/next/dist/compiled/@vercel/og/index.node.js'))
  const React = require(path.join(root, 'node_modules/react'))
  const { SignalCard, FallbackCard, cardFilename } = require(path.join(buildDir, 'signal-card.js'))
  const fonts = loadFonts()
  if (!fonts.length) console.warn('! no fonts in assets/fonts — bold will be faked by size alone\n')

  // The logo is read from disk exactly like the route does.
  const logoPath = path.join(root, 'assets', 'og', 'logo-mark.png')
  const logo = fs.existsSync(logoPath)
    ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
    : undefined
  if (!logo) console.warn('! assets/og/logo-mark.png missing — rendering without the mark\n')

  const wanted = process.argv.slice(2)
  const names = wanted.length ? wanted : Object.keys(FIXTURES)

  for (const name of names) {
    const model = FIXTURES[name]
    if (!model) {
      console.error(`! unknown fixture "${name}" (have: ${Object.keys(FIXTURES).join(', ')})`)
      process.exitCode = 1
      continue
    }
    const el = model.tone === 'flat' && !model.symbol
      ? React.createElement(FallbackCard, { url: model.url, logo })
      : React.createElement(SignalCard, { model, logo })
    const res = new ImageResponse(el, { width: 1200, height: 630, fonts })
    const buf = Buffer.from(await res.arrayBuffer())
    const file = path.join(outDir, `${String(name).padStart(2, '0')}-${cardFilename(model)}.png`)
    fs.writeFileSync(file, buf)
    console.log(`${name.padEnd(10)} ${(buf.length / 1024).toFixed(1).padStart(7)} kB  ${path.relative(root, file)}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
