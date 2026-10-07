import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { customerService } from '@/services/customer.service'

/**
 * Customer permissions end-to-end per the Permission Matrix (issue #4),
 * exercised through the app's single seam: services/supabase-js against the
 * real local Supabase — no mocks, so RLS (migration 0003) is enforced for
 * real. Test names mirror the matrix cells.
 *
 * Users of every role are seeded through the real signup path (the signup
 * trigger runs for real) before the assertions; cleanup uses the local
 * service-role key (RLS-bypass), mirroring the other suites.
 */

const PASSWORD = 'Cust0m-Password-123'

interface SeededUser {
  userId: string
  salesId: string | null
  client: SupabaseClient
}

const users = {} as Record<'admin' | 'manager' | 'salesA' | 'salesB', SeededUser>
const createdUserIds: string[] = []
const createdCustomerCodes: string[] = []

// fallow-ignore-next-line complexity
async function seedUser(
  role: 'admin' | 'manager' | 'sales',
  extraMetadata: Record<string, unknown> = {},
): Promise<SeededUser> {
  const client = createClient(getEnvUrl(), getEnvAnonKey())
  const rnd = crypto.randomUUID().slice(0, 8)
  const email = `cust-${role}-${rnd}@example.com`

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `Customer ${role} ${rnd}`, ...extraMetadata },
    },
  })
  if (error) throw error
  const userId = data.user?.id
  if (!userId) throw new Error('signUp did not return a user id')
  createdUserIds.push(userId)

  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw signInError

  // The signup trigger gives every owner-capable user a sales row.
  const { data: salesRows, error: salesError } = await client
    .from('sales')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (salesError) throw salesError
  const salesId = role === 'admin' ? null : (salesRows?.[0] as { id: string } | undefined)?.id
  if (role !== 'admin' && !salesId) throw new Error(`missing sales row for ${role} user`)

  return { userId, salesId: salesId ?? null, client }
}

function baseCustomerInput(code: string) {
  // No sales_id by default: omitting the Sales Owner column lets the DB
  // auto-assign it to the inserting owner-capable user (migration 0003).
  return {
    customer_code: code,
    customer_name: `Customer ${code}`,
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    description: '',
    status: 'active' as const,
  }
}

async function createCustomerWithOwner(
  client: SupabaseClient,
  code: string,
  salesId: string,
): Promise<void> {
  createdCustomerCodes.push(code)
  await customerService.create(
    { ...baseCustomerInput(code), sales_id: salesId },
    client,
  )
}

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `CSTA-${rnd}`, username: `csta-${rnd}` })
  users.salesB = await seedUser('sales', { sales_code: `CSTB-${rnd}`, username: `cstb-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  // One base customer per sales user, so cross-owner attempts have targets.
  await createCustomerWithOwner(
    users.salesA.client,
    `CSTA-C-${rnd}`,
    users.salesA.salesId as string,
  )
  await createCustomerWithOwner(
    users.salesB.client,
    `CSTB-C-${rnd}`,
    users.salesB.salesId as string,
  )
})

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
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

async function ownerOf(client: SupabaseClient, code: string): Promise<string | null> {
  // service-role read: the stored truth, not a role-filtered view
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin
    .from('customers')
    .select('sales_id')
    .eq('customer_code', code)
    .limit(1)
  return (data?.[0] as { sales_id: string } | undefined)?.sales_id ?? null
}

describe('Customer permissions per the matrix (issue #4)', () => {
  test('read: every role reads every non-deleted customer', async () => {
    for (const u of Object.values(users)) {
      const rows = await customerService.getAll(u.client)
      const codes = rows.map((c) => c.customer_code)
      expect(codes).toContain(createdCustomerCodes[0]) // owned by salesA
      expect(codes).toContain(createdCustomerCodes[1]) // owned by salesB
    }
  })

  test('create: manager can insert any customer (explicit owner allowed)', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTM-C-${rnd}`
    const created = await customerService.create(
      { ...baseCustomerInput(code), sales_id: users.salesA.salesId as string },
      users.manager.client,
    )
    createdCustomerCodes.push(code)
    expect(created.sales_id).toBe(users.salesA.salesId)
  })

  test('create: sales insert becomes the Sales Owner automatically', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTSA-C-${rnd}`
    // No sales_id in the payload — the DB must assign the inserting sales
    // user's own row as the Sales Owner (migration 0003 trigger).
    const created = await customerService.create(baseCustomerInput(code), users.salesA.client)
    createdCustomerCodes.push(code)
    expect(created.sales_id).toBe(users.salesA.salesId)
  })

  test('create: sales cannot assign another Sales Owner', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTSX-C-${rnd}`
    createdCustomerCodes.push(code)
    await expect(
      customerService.create(
        { ...baseCustomerInput(code), sales_id: users.salesB.salesId as string },
        users.salesA.client,
      ),
    ).rejects.toThrow()
    // nothing was created under the other user's ownership
    expect(await ownerOf(users.admin.client, code)).toBeNull()
  })

  test('create: admin can insert a customer with an explicit owner', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTAD-C-${rnd}`
    const created = await customerService.create(
      { ...baseCustomerInput(code), sales_id: users.salesB.salesId as string },
      users.admin.client,
    )
    createdCustomerCodes.push(code)
    expect(created.sales_id).toBe(users.salesB.salesId)
  })

  test('update: manager can update any customer', async () => {
    const code = createdCustomerCodes[0] // owned by salesA, not by the manager
    const updated = await customerService.update(
      (await customerIdByCode(code)) as string,
      { customer_name: `Manager renamed ${code}` },
      users.manager.client,
    )
    expect(updated.customer_name).toBe(`Manager renamed ${code}`)
  })

  test('update: manager cannot change the Sales Owner (read-only field)', async () => {
    const code = createdCustomerCodes[0]
    await expect(
      customerService.update(
        (await customerIdByCode(code)) as string,
        { customer_name: 'Manager hijack', sales_id: users.manager.salesId as string },
        users.manager.client,
      ),
    ).rejects.toThrow()
    // the owner is unchanged — reassignment is Admin-only
    expect(await ownerOf(users.admin.client, code)).toBe(users.salesA.salesId)
  })

  test('update: sales can update own customer', async () => {
    const code = createdCustomerCodes[0]
    const updated = await customerService.update(
      (await customerIdByCode(code)) as string,
      { customer_name: `Sales renamed ${code}` },
      users.salesA.client,
    )
    expect(updated.customer_name).toBe(`Sales renamed ${code}`)
  })

  test('update: sales cannot update another sales’ customer', async () => {
    const code = createdCustomerCodes[1]
    await expect(
      customerService.update(
        (await customerIdByCode(code)) as string,
        { customer_name: 'Sales hijack' },
        users.salesA.client,
      ),
    ).rejects.toThrow()
  })

  test('update: sales cannot change the Sales Owner even on own customer', async () => {
    const code = createdCustomerCodes[0]
    await expect(
      customerService.update(
        (await customerIdByCode(code)) as string,
        { customer_name: 'Still mine', sales_id: users.salesB.salesId as string },
        users.salesA.client,
      ),
    ).rejects.toThrow()
    expect(await ownerOf(users.admin.client, code)).toBe(users.salesA.salesId)
  })

  test('update: admin can reassign the Sales Owner (Admin-only ownership)', async () => {
    const code = createdCustomerCodes[0]
    const customerId = (await customerIdByCode(code)) as string

    const moved = await customerService.update(
      customerId,
      { sales_id: users.salesB.salesId as string },
      users.admin.client,
    )
    expect(moved.sales_id).toBe(users.salesB.salesId)

    // and back, so later tests keep their expected owner
    await customerService.update(
      customerId,
      { sales_id: users.salesA.salesId as string },
      users.admin.client,
    )
  })

  test('delete: manager cannot delete (RLS rejects the soft delete)', async () => {
    const code = createdCustomerCodes[1]
    await expect(
      customerService.softDelete((await customerIdByCode(code)) as string, users.manager.client),
    ).rejects.toThrow()
    // the row is still alive for everyone
    const rows = await customerService.getAll(users.salesB.client)
    expect(rows.map((c) => c.customer_code)).toContain(code)
  })

  test('delete: sales can soft-delete own customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTSD-C-${rnd}`
    const created = await customerService.create(baseCustomerInput(code), users.salesA.client)
    createdCustomerCodes.push(code)

    await customerService.softDelete(created.id, users.salesA.client)
    expect(await deletedAtOf(code)).not.toBeNull()

    const rows = await customerService.getAll(users.salesA.client)
    expect(rows.map((c) => c.customer_code)).not.toContain(code)
  })

  test('delete: sales cannot delete another sales’ customer', async () => {
    const code = createdCustomerCodes[1]
    await expect(
      customerService.softDelete((await customerIdByCode(code)) as string, users.salesA.client),
    ).rejects.toThrow()
    const rows = await customerService.getAll(users.salesB.client)
    expect(rows.map((c) => c.customer_code)).toContain(code)
  })

  test('delete: admin can delete any customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `CSTDA-C-${rnd}`
    await createCustomerWithOwner(
      users.admin.client,
      code,
      users.salesB.salesId as string,
    )

    await customerService.softDelete((await customerIdByCode(code)) as string, users.admin.client)
    expect(await deletedAtOf(code)).not.toBeNull()
  })
})

async function customerIdByCode(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin.from('customers').select('id').eq('customer_code', code).limit(1)
  return (data?.[0] as { id: string } | undefined)?.id ?? null
}

async function deletedAtOf(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin
    .from('customers')
    .select('deleted_at')
    .eq('customer_code', code)
    .limit(1)
  return (data?.[0] as { deleted_at: string | null } | undefined)?.deleted_at ?? null
}
