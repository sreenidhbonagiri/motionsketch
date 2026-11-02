import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(dirname(fileURLToPath(import.meta.url)), 'html-preview')
mkdirSync(outDir, { recursive: true })

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
})
try {
  const load = await server.ssrLoadModule('/src/examples/load.ts')
  const htmlDemo = await server.ssrLoadModule('/src/core/export/htmlDemo.ts')
  const loaded = load.loadExampleSnapshot('paper-plane')
  if (!loaded.ok) throw new Error(loaded.error)
  const html = htmlDemo.buildHtmlDemoFromProject(loaded.snapshot.project)
  const outPath = join(outDir, 'paper-plane.html')
  writeFileSync(outPath, html)
  console.log('wrote', outPath, html.length)
} finally {
  await server.close()
}
