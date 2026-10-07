import processEnv from 'process'

/**
 * Env helpers for tests. Values point at the LOCAL Supabase stack
 * (created from `npx supabase status`, stored in gitignored .env).
 *
 * Required:
 *   VITE_SUPABASE_URL       — http://127.0.0.1:54321 (or shifted port)
 *   VITE_SUPABASE_ANON_KEY  — the anon JWT
 *   VITE_SUPABASE_SERVICE_KEY — local service-role (for the test's cleanup)
 */
export function getEnvUrl(): string {
  const url = processEnv.env.VITE_SUPABASE_URL
  if (!url) {
    throw new Error(
      'VITE_SUPABASE_URL missing in .env. Create .env from ' +
        '`npx supabase status` (see .env.example).',
    )
  }
  return url
}

export function getEnvAnonKey(): string {
  const key = processEnv.env.VITE_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY missing in .env. Create .env from ' +
        '`npx supabase status` (see .env.example).',
    )
  }
  return key
}

export function getEnvServiceKey(): string {
  const key = processEnv.env.VITE_SUPABASE_SERVICE_KEY
  if (!key) {
    throw new Error(
      'VITE_SUPABASE_SERVICE_KEY missing in .env. The local service-role key ' +
        'is listed by `npx supabase status` under `service_role`. Copy it into ' +
        '.env — the smoke test cleanup needs it (RLS-bypass).',
    )
  }
  return key
}
