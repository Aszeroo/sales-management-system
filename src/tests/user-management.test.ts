import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { userService } from '@/services/user.service'
import type { ManagedUser } from '@/types'

/**
 * Full User management for Admin (issue #7, ADR-0001), exercised through the
 * app's seam: services/supabase-js against the real local Supabase — no
 * mocks, so RLS, the signup trigger and GoTrue's real ban behavior are
 * exercised.
 *
 * Seeding goes through the real signup path (the on_auth_user_created
 * trigger runs exactly as it would in the app). The Admin operations go
 * through the admin SECURITY DEFINER RPCs via a signed-in admin client —
 * the same path the unified users page uses.
 */

const PASSWORD = 'User-Mgmt-Password-123'
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
  const email = `${role}-um-${rnd}@example.com`
  const fullName = `UM ${role} ${rnd}`

  // Real signup path: metadata carries the role; the signup trigger
  // (handle_new_user) runs exactly as it would in the app.
  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: fullName, ...extraMetadata },
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

/** Fresh client signed in with explicit credentials (no shared session). */
async function signInFresh(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

/** The sales row(s) of a user as the admin sees them. */
async function salesRowsFor(userId: string, opts: { onlyActive?: boolean } = {}) {
  let query = adminClient.from('sales').select('id, user_id, sales_code, username, full_name, email, status, deleted_at').eq('user_id', userId)
  if (opts.onlyActive) query = query.is('deleted_at', null)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/** Admin-owned insert of an active Customer under a given Sales Owner. */
async function adminCreatesCustomer(salesId: string): Promise<string> {
  const code = `UM-C-${crypto.randomUUID().slice(0, 8)}`
  const { data, error } = await adminClient
    .from('customers')
    .insert({ customer_code: code, customer_name: `UM Customer ${code}`, sales_id: salesId, status: 'active' })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

let adminClient: SupabaseClient
let adminUser: SeededUser

beforeAll(async () => {
  adminUser = await seedUser('admin')
  adminClient = adminUser.client
})

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

describe('Admin creates a User of any role from one RPC (issue #7)', () => {
  test('sales user → sales row auto-created by the signup trigger, user can sign in', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const email = `created-sales-${rnd}@example.com`
    const userId = await userService.create(
      { email, password: 'Created-Pass-123', full_name: `Created Sales ${rnd}`, role: 'sales' },
      adminClient,
    )
    createdUserIds.push(userId)

    // The account is real: signing in with the given password works and the
    // fresh session carries the chosen role.
    const fresh = await signInFresh(email, 'Created-Pass-123')
    const { data: me } = await fresh.auth.getUser()
    expect(me.user?.user_metadata?.role).toBe('sales')

    // Owner-capable ⇒ the trigger created exactly one active sales row.
    const rows = await salesRowsFor(userId, { onlyActive: true })
    expect(rows).toHaveLength(1)
    expect((rows[0] as Record<string, string>).sales_code).toMatch(/^SL-/)
    expect((rows[0] as Record<string, string>).email).toBe(email)

    // And the profile row exists (same trigger).
    const { data: profile } = await adminClient.from('profiles').select('id, full_name').eq('id', userId).single()
    expect(profile).not.toBeNull()
    expect((profile as { full_name: string }).full_name).toBe(`Created Sales ${rnd}`)
  })

  test('manager user → sales row auto-created as well (same owner-capable rule)', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const email = `created-manager-${rnd}@example.com`
    const userId = await userService.create(
      { email, password: 'Created-Pass-123', full_name: `Created Manager ${rnd}`, role: 'manager' },
      adminClient,
    )
    createdUserIds.push(userId)

    const rows = await salesRowsFor(userId, { onlyActive: true })
    expect(rows).toHaveLength(1)
  })

  test('admin user → NO sales row (Admin is never a Sales Owner)', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const email = `created-admin-${rnd}@example.com`
    const userId = await userService.create(
      { email, password: 'Created-Pass-123', full_name: `Created Admin ${rnd}`, role: 'admin' },
      adminClient,
    )
    createdUserIds.push(userId)

    const fresh = await signInFresh(email, 'Created-Pass-123')
    const { data: me } = await fresh.auth.getUser()
    expect(me.user?.user_metadata?.role).toBe('admin')

    // Admin sees ALL sales rows through its FOR ALL policy, so zero rows for
    // this user_id proves no sales row exists (not just that it is hidden).
    expect(await salesRowsFor(userId)).toHaveLength(0)
  })

  test('the created users all appear in the unified list with their role', async () => {
    const users: ManagedUser[] = await userService.getAll(adminClient)
    const mine = users.filter((u) => createdUserIds.includes(u.user_id))
    const roles = new Map(mine.map((u) => [u.email, u.role]))

    expect(mine.length).toBeGreaterThanOrEqual(4)
    expect([...roles.values()]).toContain('sales')
    expect([...roles.values()]).toContain('manager')
    expect([...roles.values()]).toContain('admin')
    // Every listed user is active by default and admins have no sales row.
    for (const u of mine) {
      expect(u.is_active).toBe(true)
      if (u.role === 'admin') expect(u.sales_id).toBeNull()
    }
  })
})

describe('Deactivate is a real ban (issue #7)', () => {
  test('deactivated user cannot sign in; reactivated user can again', async () => {
    const user = await seedUser('sales')

    await userService.setActive(user.userId, false, adminClient)

    const banned = await anonClient().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(banned.error).not.toBeNull()
    expect((banned.error?.message || '').toLowerCase()).toContain('banned')

    await userService.setActive(user.userId, true, adminClient)

    const unblocked = await anonClient().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(unblocked.error).toBeNull()
  })
})

describe('Owner-reassignment guard (issue #7, ADR-0001)', () => {
  test('pending reassignment count returns the number of owned customers', async () => {
    const user = await seedUser('sales')
    const rows = await salesRowsFor(user.userId, { onlyActive: true })
    const salesId = (rows[0] as { id: string }).id

    expect(await userService.getPendingReassignmentCount(user.userId, adminClient)).toBe(0)

    await adminCreatesCustomer(salesId)
    await adminCreatesCustomer(salesId)

    expect(await userService.getPendingReassignmentCount(user.userId, adminClient)).toBe(2)
  })

  test('deactivating a user who owns customers is rejected with the count', async () => {
    const user = await seedUser('sales')
    const rows = await salesRowsFor(user.userId, { onlyActive: true })
    const salesId = (rows[0] as { id: string }).id
    const c1 = await adminCreatesCustomer(salesId)
    const c2 = await adminCreatesCustomer(salesId)

    const { error } = await adminClient.rpc('admin_set_user_active', { p_user_id: user.userId, p_active: false })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('2')

    // The advance-warning endpoint reports the same number.
    expect(await userService.getPendingReassignmentCount(user.userId, adminClient)).toBe(2)

    // Once the customers are gone, deactivation succeeds — the guard is the
    // customer count, not the role.
    const admin = serviceClient()
    await admin.from('customers').delete().in('id', [c1, c2])
    await userService.setActive(user.userId, false, adminClient)
    expect((await salesRowsFor(user.userId, { onlyActive: true }))[0]).toBeTruthy()
  })

  test('promoting a Sales Owner to admin is rejected with the count; works after reassignment', async () => {
    const user = await seedUser('sales')
    const manager = await seedUser('manager')
    const rows = await salesRowsFor(user.userId, { onlyActive: true })
    const salesId = (rows[0] as { id: string }).id
    await adminCreatesCustomer(salesId)

    const { error } = await adminClient.rpc('admin_change_role', { p_user_id: user.userId, p_new_role: 'admin' })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('1')

    // Reassign the customer to the manager (Admin-only ownership change,
    // same as the customer UI from issue #4) — then promotion succeeds.
    const mgrRows = await salesRowsFor(manager.userId, { onlyActive: true })
    const { error: reassignError } = await adminClient
      .from('customers')
      .update({ sales_id: (mgrRows[0] as { id: string }).id })
      .eq('sales_id', salesId)
    expect(reassignError).toBeNull()
    expect(await userService.getPendingReassignmentCount(user.userId, adminClient)).toBe(0)

    await userService.changeRole(user.userId, 'admin', adminClient)
    // ADR-0001: an admin never keeps a sales row.
    expect(await salesRowsFor(user.userId, { onlyActive: true })).toHaveLength(0)
  })

  test('count is 0 for admins too — they never own customers', async () => {
    expect(await userService.getPendingReassignmentCount(adminUser.userId, adminClient)).toBe(0)
  })
})

describe('Role changes (issue #7)', () => {
  test('Sales <-> Manager changes work and keep the sales row', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const user = await seedUser('sales', { sales_code: `UMS-${rnd}`, username: `ums-${rnd}` })
    const before = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string; sales_code: string }

    await userService.changeRole(user.userId, 'manager', adminClient)
    const freshMgr = await signInFresh(user.email, PASSWORD)
    const { data: mgr } = await freshMgr.auth.getUser()
    expect(mgr.user?.user_metadata?.role).toBe('manager')
    const afterMgr = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string; sales_code: string }
    expect(afterMgr.id).toBe(before.id)
    expect(afterMgr.sales_code).toBe('UMS-' + rnd)

    await userService.changeRole(user.userId, 'sales', adminClient)
    const freshSales = await signInFresh(user.email, PASSWORD)
    const { data: sls } = await freshSales.auth.getUser()
    expect(sls.user?.user_metadata?.role).toBe('sales')
  })

  test('promotion to admin and demotion back keep the sales-row invariant (ADR-0001)', async () => {
    const user = await seedUser('manager')
    const before = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string; sales_code: string }

    await userService.changeRole(user.userId, 'admin', adminClient)
    expect(await salesRowsFor(user.userId, { onlyActive: true })).toHaveLength(0)
    // The row is soft-deleted, not destroyed — the customer history keeps its FK.
    expect((await salesRowsFor(user.userId)).length).toBe(1)
    const freshAdmin = await signInFresh(user.email, PASSWORD)
    const { data: adm } = await freshAdmin.auth.getUser()
    expect(adm.user?.user_metadata?.role).toBe('admin')

    await userService.changeRole(user.userId, 'sales', adminClient)
    const revived = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string; sales_code: string }
    expect(revived.id).toBe(before.id)
    expect(revived.sales_code).toBe(before.sales_code)
  })
})

describe('Password reset (issue #7)', () => {
  test('after a reset the old password fails and the new one works', async () => {
    const user = await seedUser('sales')

    await userService.resetPassword(user.userId, 'Brand-New-Pass-456', adminClient)

    const oldTry = await anonClient().auth.signInWithPassword({ email: user.email, password: PASSWORD })
    expect(oldTry.error).not.toBeNull()

    const newTry = await anonClient().auth.signInWithPassword({ email: user.email, password: 'Brand-New-Pass-456' })
    expect(newTry.error).toBeNull()
  })
})

describe('Admin-only RPCs (issue #7)', () => {
  test('every admin RPC rejects sales, manager and anonymous callers with a clear error', async () => {
    const sales = await seedUser('sales')
    const manager = await seedUser('manager')
    const strangerId = crypto.randomUUID()

    const attempts: { name: string; call: (c: SupabaseClient) => PromiseLike<unknown> }[] = [
      { name: 'admin_list_users', call: (c) => c.rpc('admin_list_users') },
      {
        name: 'admin_create_user',
        call: (c) =>
          c.rpc('admin_create_user', {
            p_email: `intruder-${crypto.randomUUID().slice(0, 8)}@example.com`,
            p_password: 'Intruder-Pass-123',
            p_full_name: 'Intruder',
            p_role: 'sales',
          }),
      },
      { name: 'admin_reset_password', call: (c) => c.rpc('admin_reset_password', { p_user_id: strangerId, p_new_password: 'Whatever-123' }) },
      { name: 'admin_set_user_active', call: (c) => c.rpc('admin_set_user_active', { p_user_id: strangerId, p_active: false }) },
      { name: 'admin_change_role', call: (c) => c.rpc('admin_change_role', { p_user_id: strangerId, p_new_role: 'admin' }) },
      { name: 'admin_pending_reassignment_count', call: (c) => c.rpc('admin_pending_reassignment_count', { p_user_id: strangerId }) },
    ]

    for (const client of [sales.client, manager.client, anonClient()]) {
      for (const attempt of attempts) {
        const { error } = (await attempt.call(client)) as { error: { message: string } | null }
        expect(error, `${attempt.name} must reject non-admin callers`).not.toBeNull()
        expect(error?.message).toContain('Admin only')
      }
    }
  })
})

describe('Rule #7 — sales rows are Admin-only for writes (issue #7)', () => {
  test('sales can no longer UPDATE their own sales row', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const user = await seedUser('sales', { sales_code: `UMR-${rnd}`, username: `umr-${rnd}` })
    const own = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string; full_name: string }

    // The update must be a no-op at the DB level: no error, but 0 rows.
    const { data, error } = await user.client
      .from('sales')
      .update({ full_name: 'HACKED-BY-SALES' })
      .eq('id', own.id)
      .select()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)

    // The row is unchanged as the admin sees it.
    const { data: after } = await adminClient.from('sales').select('full_name').eq('id', own.id).single()
    expect((after as { full_name: string }).full_name).toBe(own.full_name)
  })

  test('sales can no longer INSERT a sales row either', async () => {
    const user = await seedUser('sales')
    const { error } = await user.client.from('sales').insert({
      user_id: user.userId,
      sales_code: `UMX-${crypto.randomUUID().slice(0, 8)}`,
      full_name: 'Self Made Row',
      username: `umx-${crypto.randomUUID().slice(0, 8)}`,
      email: user.email,
      status: 'active',
    })
    expect(error).not.toBeNull()
  })

  test('manager cannot write the sales table either (same owner-capable rule)', async () => {
    const user = await seedUser('manager')
    const own = (await salesRowsFor(user.userId, { onlyActive: true }))[0] as { id: string }
    const { data, error } = await user.client
      .from('sales')
      .update({ full_name: 'HACKED-BY-MANAGER' })
      .eq('id', own.id)
      .select()
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
