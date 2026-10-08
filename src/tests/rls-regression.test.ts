import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { customerService } from '@/services/customer.service'
import { projectService } from '@/services/project.service'
import { salesService } from '@/services/sales.service'
import type { Customer } from '@/types'

/**
 * RLS regression for issue #3: adding the Manager role must not change the
 * existing 2-role behavior —
 *   - Sales manages ONLY its own customers/projects (everyone reads
 *     non-deleted rows),
 *   - admin keeps full access (since #19 that is read/insert/update via the
 *     split-action Admin policies — DELETE is no longer part of it).
 *
 * (Issue #4 later opened manager write rights on customers — that contract
 * lives in customer-permissions.test.ts; this file only keeps the behavior
 * that must stay unchanged.)
 *
 * Seam rule (issue #19): every data access here goes through the service
 * layer against the real local Supabase — no raw table calls from these
 * tests. The single exception is the hard-DELETE negative test, which must
 * use the raw client by design (there is no service method for hard DELETE;
 * that IS the thing being verified). Cleanup uses the local service-role key
 * (RLS-bypass), mirroring the smoke test — a fixture, not a role seam.
 */

const PASSWORD = 'Tr4cer-Password-123'

interface SeededUser {
  userId: string
  salesId: string | null
  client: SupabaseClient
}

const users = {} as Record<'salesA' | 'salesB' | 'manager' | 'admin', SeededUser>
const createdUserIds: string[] = []
const createdCustomerCodes: string[] = []

async function seedUser(
  role: 'admin' | 'manager' | 'sales',
  extraMetadata: Record<string, unknown> = {},
): Promise<SeededUser> {
  const client = createClient(getEnvUrl(), getEnvAnonKey())
  const rnd = crypto.randomUUID().slice(0, 8)
  const email = `rls-${role}-${rnd}@example.com`

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `RLS ${role} ${rnd}`, ...extraMetadata },
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
    customer_name: `RLS Customer ${code}`,
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

/** Live customer codes as one client's service-layer read sees them. */
async function liveCustomerCodes(client: SupabaseClient): Promise<string[]> {
  const rows = await customerService.getAll(client)
  return rows.map((c) => c.customer_code)
}

/** Live project codes as one client's service-layer read sees them. */
async function liveProjectCodes(client: SupabaseClient): Promise<string[]> {
  const rows = await projectService.getAll(client)
  return rows.map((p) => p.project_code)
}

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `RLSA-${rnd}`, username: `rlsa-${rnd}` })
  users.salesB = await seedUser('sales', { sales_code: `RLSB-${rnd}`, username: `rlsb-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  // A base customer owned by sales B that everyone can see.
  await createCustomer(users.salesB.client, `RLSB-C-${rnd}`, users.salesB.salesId as string)
})

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  // Projects reference customers (ON DELETE RESTRICT) — clear them first.
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

describe('RLS regression: 2-role behavior preserved under the 3-role model', () => {
  test('sales can insert a customer under their own sales_id', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const created = await createCustomer(
      users.salesA.client,
      `RLSA-C-${rnd}`,
      users.salesA.salesId as string,
    )
    expect(created.sales_id).toBe(users.salesA.salesId)
  })

  test('sales cannot insert a customer under another sales row', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `RLSA-X-${rnd}`
    // RLS WITH CHECK must reject the cross-ownership insert.
    await expect(
      createCustomer(users.salesA.client, code, users.salesB.salesId as string),
    ).rejects.toThrow()
    // Sales reads every live row, so absence here proves nothing was created.
    expect(await liveCustomerCodes(users.salesA.client)).not.toContain(code)
  })

  test('sales can update their own customer but not another sales’ customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const own = await createCustomer(
      users.salesA.client,
      `RLSA-U-${rnd}`,
      users.salesA.salesId as string,
    )

    const renamed = await customerService.update(
      own.id,
      { customer_name: `Renamed ${own.customer_code}` },
      users.salesA.client,
    )
    expect(renamed.customer_name).toBe(`Renamed ${own.customer_code}`)

    // The other sales' customers are invisible for updates: sales A can READ
    // sales B's base customer but the service's single-row update finds no
    // updatable row and throws.
    const [foreign] = (await customerService.getAll(users.salesA.client)).filter(
      (c) => c.customer_code === createdCustomerCodes[0],
    )
    expect(foreign).toBeTruthy()
    await expect(
      customerService.update((foreign as Customer).id, { customer_name: 'Hijacked' }, users.salesA.client),
    ).rejects.toThrow()
    const untouched = (await customerService.getAll(users.salesA.client)).find(
      (c) => c.customer_code === createdCustomerCodes[0],
    )
    expect(untouched?.customer_name).toBe(`RLS Customer ${createdCustomerCodes[0]}`)
  })

  test('sales cannot delete another sales’ customer', async () => {
    // DOCUMENTED RAW-CLIENT EXCEPTION (issue #19 spec): a hard DELETE has no
    // service method by design — the service layer only offers the
    // soft-delete RPC — so this negative test measures the policy boundary
    // itself through the raw client. With no FOR DELETE policy on customers
    // (issue #19) the DELETE matches zero rows for every role.
    const { data, error } = await users.salesA.client
      .from('customers')
      .delete()
      .eq('sales_id', users.salesB.salesId as string)
      .select()
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
    // the base customer (owned by sales B) is untouched
    expect(await liveCustomerCodes(users.salesA.client)).toContain(createdCustomerCodes[0])
  })

  test('sales still reads every non-deleted customer (including other sales’ rows)', async () => {
    const codes = await liveCustomerCodes(users.salesA.client)
    expect(codes).toContain(createdCustomerCodes[0]) // the seeded sales B customer
  })

  test('manager can read every non-deleted customer (write rights since #4)', async () => {
    // Reading everything is the part of the 2-role behavior that still holds
    // for the manager. The manager's insert/update rights opened in #4 are
    // covered by customer-permissions.test.ts — including what is still
    // forbidden (delete, Sales Owner changes).
    expect(await liveCustomerCodes(users.manager.client)).toContain(createdCustomerCodes[0])
  })

  test('admin keeps full access on customers', async () => {
    // Since #19 this is the split-action Admin policy (SELECT/INSERT/UPDATE)
    // doing its job: Admin reads, writes and edits any Customer — hard
    // DELETE is what Admin no longer has (see soft-delete-only.test.ts).
    const rnd = crypto.randomUUID().slice(0, 8)
    const created = await createCustomer(
      users.admin.client,
      `RLSA-A-${rnd}`,
      users.salesA.salesId as string,
    )
    const renamed = await customerService.update(
      created.id,
      { customer_name: `Admin renamed ${created.customer_code}` },
      users.admin.client,
    )
    expect(renamed.customer_name).toBe(`Admin renamed ${created.customer_code}`)
  })

  test('sales can insert a project under their own customer, not under another sales’ customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const own = await createCustomer(
      users.salesA.client,
      `RLSA-PB-${rnd}`,
      users.salesA.salesId as string,
    )

    const ownProjectCode = `RLSA-P-${rnd}`
    const created = await projectService.create(
      {
        project_code: ownProjectCode,
        project_name: `RLS Project ${rnd}`,
        customer_id: own.id,
        description: '',
        budget: 0,
        start_date: null,
        end_date: null,
        status: 'planning',
      },
      users.salesA.client,
    )
    expect(created.customer_id).toBe(own.id)

    // The seeded customer belongs to sales B — a project under it must be
    // rejected, and nothing may exist under its code afterwards.
    const foreignProjectCode = `RLSX-P-${rnd}`
    const [foreignCustomer] = (await customerService.getAll(users.salesA.client)).filter(
      (c) => c.customer_code === createdCustomerCodes[0],
    )
    expect(foreignCustomer).toBeTruthy()

    await expect(
      projectService.create(
        {
          project_code: foreignProjectCode,
          project_name: `RLS Foreign Project ${rnd}`,
          customer_id: (foreignCustomer as Customer & { id: string }).id,
          description: '',
          budget: 0,
          start_date: null,
          end_date: null,
          status: 'planning',
        },
        users.salesA.client,
      ),
    ).rejects.toThrow()
    expect(await liveProjectCodes(users.salesA.client)).not.toContain(foreignProjectCode)
  })
})
