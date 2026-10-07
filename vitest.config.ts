import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    // Load .env (gitignored) so tests read the same local Supabase URL/anon key
    // the dev server and app use, without hard-coding them.
    setupFiles: ['src/tests/setup-env.ts'],
    // Node side tests use the plain process env, not import.meta.env.
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: false,
    // Keep default pool (threads) so each test runs in a forked process.
  },
})
