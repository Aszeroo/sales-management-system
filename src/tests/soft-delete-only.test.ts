import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { customerService } from '@/services/customer.service'
import { projectService } from '@/services/project.service'
import { salesService } from '@/services/sales.service'
import type { Customer, Project } from '@/types'

/**
 * Issue #19: Soft Delete is enforced at the DATABASE level. The migration
 * keeps NO FOR DELETE policy on customers/projects for ANY role — the Admin
 * policies that used to be FOR ALL were split into SELECT/INSERT/UPDATE —
 * so a direct hard DELETE through the API matches zero rows for everyone
 * (Admin included). The soft_delete_* RPCs stay the only delete path:
 *   - Sales soft-deletes own rows via the RPC           (positive, RPC seam)
 *   - Sales direct hard DELETE is rejected by the DB    (negative, raw client)
 *   - Manager still cannot delete any way               (both paths)
 *   - Admin soft-deletes ANY row via the RPC, never hard-deletes
 *
 * Seam: services → real local Supabase. The raw supabase-js client appears
 * ONLY in the documented negative-test exception: hard DELETE has no service
 * method by design, so proving "the DB rejects it" must call the API
 * directly (issue #18 spec). Cleanup uses the local service-role key
 * (RLS-bypass) — a fixture, not a role seam.
 */

const PASSWORD = 'S0ftDel-Password-123'

interface SeededUser {
  userId: string
  salesId: string | null
  client: SupabaseClient
}

const users = {} as Record<'salesA' | 'manager' | 'admin', SeededUser>
const createdUserIds: string[] = []
const createdCustomerCodes: string[] = []

async function seedUser(
  role: 'admin' | 'manager' | 'sales',
  extraMetadata: Record<string, unknown> = {},
): Promise<SeededUser> {
  const client = createClient(getEnvUrl(), getEnvAnonKey())
  const rnd = crypto.randomUUID().slice(0, 8)
  const email = `sfdel-${role}-${rnd}@example.com`

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `SoftDel ${role} ${rnd}`, ...extraMetadata },
    },
  })
  if (error) throw error
  const userId = data.user?.id
  if (!userId) throw new Error('signUp did not return a user id')
  createdUserIds.push(userId)

  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError

  // The signup trigger gives every owner-capable user a sales row.
  const sales = await salesService.getCurrentUserSales(client)
  if (role !== 'admin' && !sales) throw new Error(`missing sales row for ${role} user`)

  return { userId, salesId: sales?.id ?? null, client }
}

function baseCustomerInput(code: string) {
  return {
    customer_code: code,
    customer_name: `SoftDel Customer ${code}`,
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    description: '',
    status: 'active' as const,
  }
}

async function createCustomer(
  client: SupabaseClient,
  code: string,
  salesId: string,
): Promise<Customer> {
  createdCustomerCodes.push(code)
  return customerService.create({ ...baseCustomerInput(code), sales_id: salesId }, client)
}

async function createProject(
  client: SupabaseClient,
  code: string,
  customerId: string,
): Promise<Project> {
  return projectService.create(
    {
      project_code: code,
      project_name: `SoftDel Project ${code}`,
      customer_id: customerId,
      description: '',
      budget: 0,
      start_date: null,
      end_date: null,
      status: 'planning',
    },
    client,
  )
}

// Live targets seeded for the direct-delete attempts (created through the
// service layer as sales A's rows, so every claim below is about rows some
// role could legitimately touch).
let ownCustomerId: string
let ownProjectId: string

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `SFD-${rnd}`, username: `sfd-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  const customer = await createCustomer(
    users.salesA.client,
    `SFD-C-${rnd}`,
    users.salesA.salesId as string,
  )
  ownCustomerId = customer.id
  ownProjectId = (await createProject(users.salesA.client, `SFD-P-${rnd}`, ownCustomerId)).id
})

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  // Projects first — customers RESTRICT on live project references.
  const { data: createdCustomers } = await admin
    .from('customers')
    .select('id')
    .in('customer_code', createdCustomerCodes)
  for (const row of createdCustomers ?? []) {
    await admin.from('projects').delete().eq('customer_id', (row as { id: string }).id)
  }
  await admin.from('customers').delete().in('customer_code', createdCustomerCodes)
  for (const userId of createdUserIds) {
    const { data: salesRows } = await admin.from('sales').select('id').eq('user_id', userId)
    for (const row of salesRows ?? []) {
      await admin.from('customers').delete().eq('sales_id', (row as { id: string }).id)
    }
    await admin.from('sales').delete().eq('user_id', userId)
    await admin.from('profiles').delete().eq('id', userId)
  }
})

/** Customer id as the SERVICE read of the given client sees it (alive ⇔ visible). */
async function liveCustomerId(client: SupabaseClient, id: string): Promise<string | null> {
  const rows = await customerService.getAll(client)
  return rows.find((c) => c.id === id)?.id ?? null
}

async function liveProjectId(client: SupabaseClient, id: string): Promise<string | null> {
  const rows = await projectService.getAll(client)
  return rows.find((p) => p.id === id)?.id ?? null
}

describe('Soft Delete enforced at the DB level: no role may hard DELETE customers/projects (issue #19)', () => {
  test('Sales direct hard DELETE of own Customer is rejected by the DB (zero rows, row survives)', async () => {
    // RAW-CLIENT EXCEPTION: no service method exists for hard DELETE — the
    // service layer exposes only softDelete (the RPC). This proves the
    // "Sales can delete own customers" FOR DELETE policy is gone.
    const { data, error } = await users.salesA.client
      .from('customers')
      .delete()
      .eq('id', ownCustomerId)
      .select()
    expect(error).toBeNull() // RLS silently matches zero rows
    expect((data ?? []).length).toBe(0)
    expect(await liveCustomerId(users.salesA.client, ownCustomerId)).toBe(ownCustomerId)
  })

  test('Sales direct hard DELETE of a Project under own Customer is rejected by the DB (zero rows, row survives)', async () => {
    const { data, error } = await users.salesA.client
      .from('projects')
      .delete()
      .eq('id', ownProjectId)
      .select()
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
    expect(await liveProjectId(users.salesA.client, ownProjectId)).toBe(ownProjectId)
  })

  test('Sales soft delete via the RPC still succeeds (the RPC remains the only delete path)', async () => {
    // Positive control for the negative tests above: the same Sales user can
    // still delete through the sanctioned RPC; only the direct DELETE died.
    const rnd = crypto.randomUUID().slice(0, 8)
    const victim = await createCustomer(
      users.salesA.client,
      `SFD-S-${rnd}`,
      users.salesA.salesId as string,
    )
    await customerService.softDelete(victim.id, users.salesA.client)
    expect(await liveCustomerId(users.salesA.client, victim.id)).toBeNull()
    // the RPC soft-deleted, it did not remove: service-role truth shows deleted_at set
    const admin = createClient(getEnvUrl(), getEnvServiceKey())
    const { data } = await admin
      .from('customers')
      .select('deleted_at')
      .eq('id', victim.id)
      .single()
    expect((data as { deleted_at: string | null }).deleted_at).not.toBeNull()
  })

  test('Manager cannot delete any way: direct hard DELETE is rejected by the DB (RPC rejection in customer-permissions.test.ts)', async () => {
    const { data, error } = await users.manager.client
      .from('customers')
      .delete()
      .eq('id', ownCustomerId)
      .select()
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
    const { data: pdata, error: perror } = await users.manager.client
      .from('projects')
      .delete()
      .eq('id', ownProjectId)
      .select()
    expect(perror).toBeNull()
    expect((pdata ?? []).length).toBe(0)
    // the manager also cannot delete through the sanctioned path (prior art):
    await expect(customerService.softDelete(ownCustomerId, users.manager.client)).rejects.toThrow()
    await expect(projectService.softDelete(ownProjectId, users.manager.client)).rejects.toThrow()
    // and both rows are still alive for everyone:
    expect(await liveCustomerId(users.salesA.client, ownCustomerId)).toBe(ownCustomerId)
    expect(await liveProjectId(users.salesA.client, ownProjectId)).toBe(ownProjectId)
  })

  test('Admin cannot hard DELETE either: direct delete of Customer and Project matches zero rows', async () => {
    // Regression guard for the FOR ALL split: Admin's policy is now
    // SELECT/INSERT/UPDATE only — DELETE is gone for Admin too.
    const customerResult = await users.admin.client
      .from('customers')
      .delete()
      .eq('id', ownCustomerId)
      .select()
    expect(customerResult.error).toBeNull()
    expect((customerResult.data ?? []).length).toBe(0)

    const projectResult = await users.admin.client
      .from('projects')
      .delete()
      .eq('id', ownProjectId)
      .select()
    expect(projectResult.error).toBeNull()
    expect((projectResult.data ?? []).length).toBe(0)

    expect(await liveCustomerId(users.salesA.client, ownCustomerId)).toBe(ownCustomerId)
    expect(await liveProjectId(users.salesA.client, ownProjectId)).toBe(ownProjectId)
  })

  test('Admin soft delete via the RPC works on any row: Customer and Project of another user', async () => {
    // The delete column of the Permission Matrix for Admin is soft delete on
    // ALL rows — prove it end-to-end here, not just in the per-issue suites.
    const rnd = crypto.randomUUID().slice(0, 8)
    // Rows owned by sales A (Admin never owns rows) — created by sales A.
    const victimCustomer = await createCustomer(
      users.salesA.client,
      `SFD-AD-${rnd}`,
      users.salesA.salesId as string,
    )
    const victimProject = await createProject(
      users.salesA.client,
      `SFD-AP-${rnd}`,
      victimCustomer.id,
    )

    await projectService.softDelete(victimProject.id, users.admin.client)
    expect(await liveProjectId(users.salesA.client, victimProject.id)).toBeNull()

    await customerService.softDelete(victimCustomer.id, users.admin.client)
    expect(await liveCustomerId(users.salesA.client, victimCustomer.id)).toBeNull()

    // soft-deleted, not removed — the data is still there (service-role truth)
    const adminKey = createClient(getEnvUrl(), getEnvServiceKey())
    const { data: customerRow } = await adminKey
      .from('customers')
      .select('deleted_at')
      .eq('id', victimCustomer.id)
      .single()
    expect((customerRow as { deleted_at: string | null }).deleted_at).not.toBeNull()
  })
})
