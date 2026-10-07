import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// .env (gitignored, created from `npx supabase status` output) is in the
// repo root — resolve relative to this file: src/tests -> repo root.
dotenvConfig({ path: resolve(__dirname, '../../.env') })

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    'Missing Supabase environment variables for tests. Set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY in .env (copy from `npx supabase status`).',
  )
}
