import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'

/**
 * RLS regression for issue #3: adding the Manager role must not change the
 * existing 2-role behavior —
 *   - Sales manages ONLY its own customers/projects (everyone reads
 *     non-deleted rows),
 *   - Manager gets NO new write rights in this ticket,
 *   - admin keeps full access.
 *
 * Seeded through the real signup path (the signup trigger runs for real)
 * against the local Supabase; cleanup uses the local service-role key
 * (RLS-bypass), mirroring the smoke test.
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

async function insertCustomer(
  client: SupabaseClient,
  code: string,
  salesId: string,
): Promise<{ error: unknown }> {
  createdCustomerCodes.push(code)
  const { error } = await client.from('customers').insert({
    customer_code: code,
    customer_name: `RLS Customer ${code}`,
    sales_id: salesId,
    status: 'active',
  })
  return { error }
}

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `RLSA-${rnd}`, username: `rlsa-${rnd}` })
  users.salesB = await seedUser('sales', { sales_code: `RLSB-${rnd}`, username: `rlsb-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  // A base customer owned by sales B that everyone can see.
  const { error } = await insertCustomer(
    users.salesB.client,
    `RLSB-C-${rnd}`,
    users.salesB.salesId as string,
  )
  if (error) throw new Error(`failed to seed sales B customer: ${String(error)}`)
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
    const { error } = await insertCustomer(
      users.salesA.client,
      `RLSA-C-${rnd}`,
      users.salesA.salesId as string,
    )
    expect(error).toBeNull()
  })

  test('sales cannot insert a customer under another sales row', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const { error } = await insertCustomer(
      users.salesA.client,
      `RLSA-X-${rnd}`,
      users.salesB.salesId as string,
    )
    // RLS WITH CHECK must reject the cross-ownership insert.
    expect(error).not.toBeNull()
  })

  test('sales can update their own customer but not another sales’ customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const ownCode = `RLSA-U-${rnd}`
    const { error } = await insertCustomer(
      users.salesA.client,
      ownCode,
      users.salesA.salesId as string,
    )
    expect(error).toBeNull()

    const { data: own, error: ownError } = await users.salesA.client
      .from('customers')
      .update({ customer_name: `Renamed ${ownCode}` })
      .eq('customer_code', ownCode)
      .select()
    expect(ownError).toBeNull()
    expect((own ?? []).length).toBe(1)

    // The other sales' customers are invisible for updates: 0 affected rows.
    const { data: other, error: otherError } = await users.salesA.client
      .from('customers')
      .update({ customer_name: 'Hijacked' })
      .eq('sales_id', users.salesB.salesId as string)
      .select()
    expect(otherError).toBeNull()
    expect((other ?? []).length).toBe(0)
  })

  test('sales cannot delete another sales’ customer', async () => {
    const { data, error } = await users.salesA.client
      .from('customers')
      .delete()
      .eq('sales_id', users.salesB.salesId as string)
      .select()
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(0)
  })

  test('sales still reads every non-deleted customer (including other sales’ rows)', async () => {
    const { data, error } = await users.salesA.client
      .from('customers')
      .select('customer_code')
      .is('deleted_at', null)
    expect(error).toBeNull()
    const codes = (data ?? []).map((r) => (r as { customer_code: string }).customer_code)
    expect(codes).toContain(createdCustomerCodes[0]) // the seeded sales B customer
  })

  test('manager can read customers but gets no write rights (tickets #4/#5)', async () => {
    // Manager owns a sales row too, but this ticket opens no new write rights.
    const { data, error: readError } = await users.manager.client
      .from('customers')
      .select('customer_code')
      .is('deleted_at', null)
    expect(readError).toBeNull()
    expect((data ?? []).map((r) => (r as { customer_code: string }).customer_code)).toContain(
      createdCustomerCodes[0],
    )

    const rnd = crypto.randomUUID().slice(0, 8)
    const { error: insertError } = await insertCustomer(
      users.manager.client,
      `RLSM-C-${rnd}`,
      users.manager.salesId as string,
    )
    expect(insertError).not.toBeNull()

    const { data: updated, error: updateError } = await users.manager.client
      .from('customers')
      .update({ customer_name: 'Manager was here' })
      .eq('sales_id', users.salesB.salesId as string)
      .select()
    expect(updateError).toBeNull()
    expect((updated ?? []).length).toBe(0)
  })

  test('admin keeps full access on customers', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `RLSA-A-${rnd}`
    const { error } = await insertCustomer(
      users.admin.client,
      code,
      users.salesA.salesId as string,
    )
    expect(error).toBeNull()

    const { data, error: updateError } = await users.admin.client
      .from('customers')
      .update({ customer_name: `Admin renamed ${code}` })
      .eq('customer_code', code)
      .select()
    expect(updateError).toBeNull()
    expect((data ?? []).length).toBe(1)
  })

  test('sales can insert a project under their own customer, not under another sales’ customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const ownCode = `RLSA-PB-${rnd}`
    const { error: customerError } = await insertCustomer(
      users.salesA.client,
      ownCode,
      users.salesA.salesId as string,
    )
    expect(customerError).toBeNull()
    const { data: ownCustomer } = await users.salesA.client
      .from('customers')
      .select('id')
      .eq('customer_code', ownCode)
      .limit(1)
    const ownCustomerId = (ownCustomer?.[0] as { id: string } | undefined)?.id
    expect(ownCustomerId).toBeTruthy()

    const { error: ownProjectError } = await users.salesA.client.from('projects').insert({
      project_code: `RLSA-P-${rnd}`,
      project_name: `RLS Project ${rnd}`,
      customer_id: ownCustomerId as string,
      status: 'planning',
    })
    expect(ownProjectError).toBeNull()

    // The seeded customer belongs to sales B — a project under it must be
    // rejected.
    const { data: otherCustomer } = await users.salesA.client
      .from('customers')
      .select('id')
      .eq('customer_code', createdCustomerCodes[0])
      .limit(1)
    const otherCustomerId = (otherCustomer?.[0] as { id: string } | undefined)?.id
    expect(otherCustomerId).toBeTruthy()

    const { error: otherProjectError } = await users.salesA.client.from('projects').insert({
      project_code: `RLSX-P-${rnd}`,
      project_name: `RLS Foreign Project ${rnd}`,
      customer_id: otherCustomerId as string,
      status: 'planning',
    })
    expect(otherProjectError).not.toBeNull()
  })
})
