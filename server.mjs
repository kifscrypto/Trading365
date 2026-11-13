import { createServer } from 'node:http'
import { createRequire } from 'node:module'

process.env.NODE_ENV ||= 'production'
process.env.NEXT_RUNTIME ||= 'nodejs'

const next = (await import('next')).default
const require = createRequire(import.meta.url)
const { parseAndValidateFlightRouterState } = require('./node_modules/next/dist/server/app-render/parse-and-validate-flight-router-state.js')
const dev = process.env.NODE_ENV === 'development'
const hostname = '0.0.0.0'
const port = Number(process.env.PORT || 3000)
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

await app.prepare()

createServer((req, res) => {
  if (req.headers.rsc !== undefined) {
    try {
      parseAndValidateFlightRouterState(req.headers['next-router-state-tree'])
    } catch {
      res.writeHead(400, {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      })
      res.end('Bad Request')
      return
    }
  }

  handle(req, res).catch(error => {
    console.error(error)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(port, hostname, () => {
  console.log(`Ready on http://${hostname}:${port}`)
})
