import { readFileSync } from 'fs'

const content = readFileSync('/vercel/share/v0-project/lib/data/articles.ts', 'utf-8')

// Extract WEEX review content
const weexMatch = content.match(/slug: "weex-review"[\s\S]*?content: `([\s\S]*?)`,\n    category/)
if (weexMatch) {
  const weexContent = weexMatch[1]
  // Find KYC section
  const kycIdx = weexContent.indexOf('## WEEX KYC')
  if (kycIdx !== -1) {
    console.log('WEEX KYC section (200 chars from heading):')
    console.log(weexContent.slice(kycIdx, kycIdx + 200))
  } else {
    // Try finding any KYC heading
    const kycAlt = weexContent.indexOf('KYC')
    const headings = [...weexContent.matchAll(/## [^\n]+/g)].map(m => m[0])
    console.log('WEEX headings:', headings)
  }
}

// Extract BYDFi review content
const bydfiMatch = content.match(/slug: "bydfi-review"[\s\S]*?content: `([\s\S]*?)`,\n    category/)
if (bydfiMatch) {
  const bydfiContent = bydfiMatch[1]
  const kycIdx = bydfiContent.indexOf('## BYDFi KYC')
  if (kycIdx !== -1) {
    console.log('\nBYDFi KYC section (200 chars from heading):')
    console.log(bydfiContent.slice(kycIdx, kycIdx + 200))
  } else {
    const headings = [...bydfiContent.matchAll(/## [^\n]+/g)].map(m => m[0])
    console.log('\nBYDFi headings:', headings)
  }
}
