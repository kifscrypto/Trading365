import { readFileSync } from 'fs';

const content = readFileSync('/vercel/share/v0-project/lib/data/articles.ts', 'utf8');

// Find the what-is-kyc-crypto article's content string and look for the comparison table
const kycGuideStart = content.indexOf('slug: "what-is-kyc-crypto"');
if (kycGuideStart === -1) { console.log('Article not found'); process.exit(1); }

// Get the content field for this article (next backtick-delimited template literal after the slug)
const contentFieldStart = content.indexOf('content: `', kycGuideStart);
const contentStart = contentFieldStart + 'content: `'.length;
// Find the closing backtick for this template literal
const contentEnd = content.indexOf('`,', contentStart);
const articleContent = content.slice(contentStart, contentEnd);

// Search for the comparison table — look for "| Exchange" header
const tableIdx = articleContent.indexOf('| Exchange');
if (tableIdx === -1) {
  console.log('No "| Exchange" table found in KYC guide');
  // Print a portion around "BYDFi" to find what the table looks like
  const bydfiIdx = articleContent.indexOf('BYDFi');
  if (bydfiIdx !== -1) {
    console.log('BYDFi found at', bydfiIdx, '— context:');
    console.log(JSON.stringify(articleContent.slice(Math.max(0, bydfiIdx - 200), bydfiIdx + 600)));
  }
} else {
  console.log('Table found at index', tableIdx);
  console.log(JSON.stringify(articleContent.slice(tableIdx, tableIdx + 800)));
}
