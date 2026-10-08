import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { salesService } from '@/services/sales.service'
import { customerService } from '@/services/customer.service'

/**
 * Supabase local smoke test — runs against the SEED accounts.
 *
 * The seed (supabase/seed.sql, applied by `npx supabase db reset`) creates
 * one sign-in-able account per role, documented in the README's local-dev
 * section. This test proves the reset-to-usable path a new developer walks:
 * sign in with a seed account, rely on the signup trigger's auto sales row
 * for the owner-capable roles (and its absence for admin), and round-trip a
 * Customer through the services layer under real RLS. No throwaway signups
 * anymore — the seed IS the fixture. Destructive cleanup uses the local
 * service-role key (RLS-bypass) so the test is repeatable across
 * `npx supabase db reset`.
 */

// Keep these in sync with supabase/seed.sql and the README local-dev section.
const SEED_PASSWORD = 'Seed-Password-123'

const SEED_ACCOUNTS = [
  { email: 'admin@example.com', role: 'admin', salesCode: null },
  { email: 'manager@example.com', role: 'manager', salesCode: 'SEED-MG-001' },
  { email: 'sales@example.com', role: 'sales', salesCode: 'SEED-SL-001' },
] as const

async function signInAs(email: string): Promise<SupabaseClient> {
  const client = createClient(getEnvUrl(), getEnvAnonKey())
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD })
  if (error) {
    throw new Error(
      `seed account ${email} could not sign in — did \`npx supabase db reset\` ` +
        `apply supabase/seed.sql? (${error.message})`,
    )
  }
  return client
}

// Customer rows this test writes; removed after the suite with the
// service-role key. The seed accounts themselves are permanent fixtures.
const createdCustomerCodes: string[] = []

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  for (const code of createdCustomerCodes) {
    await admin.from('customers').delete().eq('customer_code', code)
  }
})

describe('Supabase local smoke (seed accounts)', () => {
  test('every seed account signs in with its documented credentials', async () => {
    for (const account of SEED_ACCOUNTS) {
      const client = await signInAs(account.email)
      const { data, error } = await client.auth.getUser()
      expect(error).toBeNull()
      expect(data.user?.email).toBe(account.email)
      // The role lives in user metadata — the same source get_user_role()
      // reads from the JWT, so a seed with the wrong shape fails here.
      expect(data.user?.user_metadata?.role).toBe(account.role)
    }
  })

  test('seed accounts carry the trigger-created sales rows (admin has none)', async () => {
    for (const account of SEED_ACCOUNTS) {
      const client = await signInAs(account.email)
      const salesRow = await salesService.getCurrentUserSales(client)
      if (account.salesCode === null) {
        // ADR-0001: Admin is never a Sales Owner.
        expect(salesRow).toBeNull()
      } else {
        expect(salesRow, `missing sales row for ${account.email}`).not.toBeNull()
        expect(salesRow?.sales_code).toBe(account.salesCode)
      }
    }
  })

  test('seed Sales user round-trips a Customer through the services layer', async () => {
    const sales = await signInAs('sales@example.com')
    const salesRow = await salesService.getCurrentUserSales(sales)
    if (!salesRow) throw new Error('seed sales account has no sales row')

    // Owner column omitted: the DB trigger stamps it with this user's sales
    // row and RLS validates the same rule (Sales can insert own customers).
    const customerCode = `SMK-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(customerCode)
    const created = await customerService.create(
      {
        customer_code: customerCode,
        customer_name: 'Smoke Test Customer',
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        description: '',
        status: 'active',
      },
      sales,
    )

    const readBack = await customerService.getById(created.id, sales)
    expect(readBack).not.toBeNull()
    expect(readBack?.customer_code).toBe(customerCode)
    expect(readBack?.sales_id).toBe(salesRow.id)
  })
})
