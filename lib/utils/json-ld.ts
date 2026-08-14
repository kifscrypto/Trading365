// JSON.stringify does not escape "</script>", so a DB-sourced string
// containing it breaks out of <script type="application/ld+json"> blocks.
// Escaping "<" as its JSON unicode escape is valid JSON and inert to the HTML parser.
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
