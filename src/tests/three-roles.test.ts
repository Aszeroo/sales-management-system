import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { salesService } from '@/services/sales.service'

/**
 * Tracer bullet for the 3-role permission model (issue #3, ADR-0001),
 * exercised through the app's seam: services/supabase-js against the real
 * local Supabase — no mocks, so RLS and the signup trigger are real.
 *
 * Users of every role are seeded through the real signup path (the
 * on_auth_user_created trigger runs for real) before the assertions.
 */

const PASSWORD = 'Tr4cer-Password-123'
const createdUserIds: string[] = []

function anonClient(): SupabaseClient {
  return createClient(getEnvUrl(), getEnvAnonKey())
}

function serviceClient(): SupabaseClient {
  return createClient(getEnvUrl(), getEnvServiceKey())
}

interface SeededUser {
  email: string
  fullName: string
  userId: string
  client: SupabaseClient
}

async function seedUser(
  role: 'admin' | 'manager' | 'sales',
  extraMetadata: Record<string, unknown> = {},
): Promise<SeededUser> {
  const client = anonClient()
  const rnd = crypto.randomUUID().slice(0, 8)
  const email = `${role}-${rnd}@example.com`
  const fullName = `Tracer ${role} ${rnd}`

  // Real signup path: metadata carries the role; the signup trigger
  // (handle_new_user) runs exactly as it would in the app.
  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `Tracer ${role} ${rnd}`, ...extraMetadata },
    },
  })
  if (error) throw error
  const userId = data.user?.id
  if (!userId) throw new Error('signUp did not return a user id')
  createdUserIds.push(userId)

  // Local auth auto-confirms emails — sign in right away to prove the
  // account is usable.
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError

  return { email, fullName, userId, client }
}

async function salesRowFor(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('sales')
    .select('id, user_id, sales_code, username, full_name, email, status')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw error
  return data ?? []
}

afterAll(async () => {
  // RLS-bypass cleanup with the local service-role key (same pattern as the
  // smoke test) so the suite is repeatable across `npx supabase db reset`.
  const admin = serviceClient()
  for (const userId of createdUserIds) {
    const { data: salesRows } = await admin.from('sales').select('id').eq('user_id', userId)
    for (const row of salesRows ?? []) {
      await admin.from('customers').delete().eq('sales_id', (row as { id: string }).id)
    }
    await admin.from('sales').delete().eq('user_id', userId)
    await admin.from('profiles').delete().eq('id', userId)
  }
})

describe('Tracer bullet: 3-role model (issue #3)', () => {
  test('manager signup → sales row auto-created with a generated sales_code', async () => {
    // Manager signs up WITHOUT sales-specific metadata — the system must
    // still give this Owner-capable user their sales row (ADR-0001).
    const manager = await seedUser('manager')

    const rows = await salesRowFor(manager.client, manager.userId)
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, string>
    expect(row.sales_code).toMatch(/^SL-/)
    expect(row.username).toBeTruthy()
    expect(row.full_name).toBe(manager.fullName)
    expect(row.status).toBe('active')
  })

  test('manager signup keeps supplied sales_code and username byte-for-byte', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const manager = await seedUser('manager', {
      sales_code: `MGR-${rnd}`,
      username: `mgr-${rnd}`,
    })

    const rows = await salesRowFor(manager.client, manager.userId)
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, string>
    expect(row.sales_code).toBe(`MGR-${rnd}`)
    expect(row.username).toBe(`mgr-${rnd}`)
  })

  test('admin signup → no sales row', async () => {
    const adminUser = await seedUser('admin')

    // Admin sees ALL sales rows through its FOR ALL policy, so zero rows for
    // this user_id proves no sales row exists (not just that it is hidden).
    const rows = await salesRowFor(adminUser.client, adminUser.userId)
    expect(rows).toHaveLength(0)
  })

  test('sales signup → sales row auto-created from supplied metadata (baseline preserved)', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const sales = await seedUser('sales', {
      sales_code: `SLS-${rnd}`,
      username: `sls-${rnd}`,
    })

    const rows = await salesRowFor(sales.client, sales.userId)
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, string>
    expect(row.sales_code).toBe(`SLS-${rnd}`)
    expect(row.username).toBe(`sls-${rnd}`)
  })

  test('all three roles can log in', async () => {
    for (const role of ['admin', 'manager', 'sales'] as const) {
      const user = await seedUser(role)
      const { data, error } = await user.client.auth.getUser()
      expect(error).toBeNull()
      expect(data.user?.id).toBe(user.userId)
    }
  })

  test('helper "current user\'s sales row" returns the manager\'s row', async () => {
    const manager = await seedUser('manager')
    const expected = await salesRowFor(manager.client, manager.userId)
    expect(expected).toHaveLength(1)

    const salesRow = await salesService.getCurrentUserSales(manager.client)
    expect(salesRow).not.toBeNull()
    expect(salesRow?.id).toBe((expected[0] as Record<string, string>).id)
    expect(salesRow?.sales_code).toBe((expected[0] as Record<string, string>).sales_code)
  })

  test('helper returns null for admin (no sales row) and when not signed in', async () => {
    const adminUser = await seedUser('admin')
    expect(await salesService.getCurrentUserSales(adminUser.client)).toBeNull()

    // A client with no session has no "current user" at all.
    expect(await salesService.getCurrentUserSales(anonClient())).toBeNull()
  })
})
