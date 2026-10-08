import { afterAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { salesService } from '@/services/sales.service'
import { customerService } from '@/services/customer.service'

/**
 * Issue #23 — the Customer create form's Sales Owner payload, exercised at
 * the service seam against the SEED accounts (supabase/seed.sql, README
 * local-dev). The form used to submit `sales_id: ''` whenever the signed-in
 * owner-capable user's sales row was not in hand; '' into a uuid column is
 * a DB cast error. The fixed form OMITS the field in that state and the
 * BEFORE INSERT trigger (set_default_customer_owner, migration 0001) stamps
 * the owner from the caller's own sales row — so the row always ends up
 * owned, and no caller ever sends an empty string.
 */

// Keep in sync with supabase/seed.sql / README local-dev.
const SEED_PASSWORD = 'Seed-Password-123'

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

/** The create payload the form builds: every field except the Sales Owner. */
function formPayload(code: string) {
  return {
    customer_code: code,
    customer_name: `Owner-payload ${code}`,
    company_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    description: '',
    status: 'active' as const,
  }
}

// Rows this test writes; removed after the suite with the service-role key.
const createdCustomerCodes: string[] = []

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  for (const code of createdCustomerCodes) {
    await admin.from('customers').delete().eq('customer_code', code)
  }
})

describe('Customer create Sales Owner payload (issue #23)', () => {
  test('owner-capable with no sales row in hand: field omitted, trigger auto-assigns', async () => {
    const client = await signInAs('sales@example.com')
    const ownRow = await salesService.getCurrentUserSales(client)
    if (!ownRow) throw new Error('seed sales account has no sales row')

    // The fixed form state this reproduces: own sales row unknown at submit
    // → NO sales_id key in the payload (the old payload carried '').
    const code = `OWN-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(code)
    const created = await customerService.create(formPayload(code), client)
    expect(created.sales_id).toBe(ownRow.id)
  })

  test('the pre-fix payload (sales_id: "") is a uuid cast error — why the field is omitted', async () => {
    const client = await signInAs('sales@example.com')
    const code = `OWN-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(code)
    await expect(
      customerService.create({ ...formPayload(code), sales_id: '' }, client),
    ).rejects.toThrow(/invalid input syntax for type uuid/i)
  })

  test('owner-capable WITH a sales record still sends the owner explicitly', async () => {
    const client = await signInAs('sales@example.com')
    const ownRow = await salesService.getCurrentUserSales(client)
    if (!ownRow) throw new Error('seed sales account has no sales row')

    // Unchanged path: the hidden field carries the own row id and the
    // payload sends it explicitly (RLS: "Sales can insert own customers").
    const code = `OWN-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(code)
    const created = await customerService.create(
      { ...formPayload(code), sales_id: ownRow.id },
      client,
    )
    expect(created.sales_id).toBe(ownRow.id)
  })

  test('admin (no sales row by design): omitted owner hits the NOT NULL backstop, not a cast error', async () => {
    // current_sales_id() is NULL for Admin, so the trigger assigns nothing
    // and the NOT NULL constraint rejects the row — a clean column error,
    // never the empty-string uuid cast. Admin keeps selecting the owner
    // explicitly (the Admin-only assignment rule of the Permission Matrix).
    const client = await signInAs('admin@example.com')
    const code = `OWN-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(code)
    await expect(customerService.create(formPayload(code), client)).rejects.toThrow(
      /not-null constraint|null value/i,
    )
  })
})
