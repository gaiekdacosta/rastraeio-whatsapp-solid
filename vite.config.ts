import { createReadStream, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Só no `npm run dev`: serve o primeiro .csv de data/ em /__demo/conversas.csv para o modo demonstração.
 * A planilha não fica em public/ porque tudo ali vai para o build e seria baixável sem login.
 */
function demoCsv(): Plugin {
  const dir = fileURLToPath(new URL('./data', import.meta.url))
  return {
    name: 'demo-csv',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__demo/conversas.csv', (_req, res) => {
        let file: string | undefined
        try {
          file = readdirSync(dir)
            .filter((f) => f.toLowerCase().endsWith('.csv'))
            .sort()[0]
        } catch {
          /* sem pasta data/ */
        }
        if (!file) {
          res.statusCode = 404
          res.end('Nenhum .csv em data/')
          return
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('X-File-Name', encodeURIComponent(file))
        createReadStream(join(dir, file)).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), demoCsv()],
})
