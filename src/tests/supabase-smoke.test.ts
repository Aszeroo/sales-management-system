import { describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'

/**
 * Supabase local smoke test.
 *
 * Proves the local stack + BASELINE migration reproduce today's 2-role
 * behavior faithfully: a throwaway Sales user, signed up via the app's real
 * signup path, gets a sales record from the `on_auth_user_created` trigger
 * and can own a Customer row under RLS. The destructive cleanup uses the
 * local service-role key (RLS-bypass) so the test is repeatable across
 * `npx supabase db reset`.
 */
describe('Supabase local smoke', () => {
  const password = 'Sm0k3-Password-123'

  // fallow-ignore-next-line complexity
  test('signs up a Sales user, owns a Customer row, reads it back, cleans up', async () => {
    const url = getEnvUrl()
    const anonKey = getEnvAnonKey()
    const client = createClient(url, anonKey)

    // Throwaway fixture: unique per run so the test is repeatable even when
    // the auth.users row of a previous run cannot be cleared via Data API.
    const rnd = crypto.randomUUID().slice(0, 8)
    const email = `smoke-${rnd}@example.com`
    const salesCode = `SMK-${rnd}`
    const username = `smoke-${rnd}`
    const fullName = 'Smoke Test Sales'

    // 1. Sign up a throwaway Sales user via the app's real signup path
    //    (metadata carries role + sales_code + username so the trigger can
    //    auto-create a sales record).
    const { data: signUpData, error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'sales',
          full_name: fullName,
          sales_code: salesCode,
          username,
        },
      },
    })
    if (signUpError) throw signUpError
    const userId = signUpData.user?.id
    if (!userId) throw new Error('signUp did not return a user id')

    // 2. Local auth auto-confirms emails by default — sign in immediately
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) throw signInError

    // 3. The trigger must have created our sales record for this user
    const { data: salesRows, error: salesError } = await client
      .from('sales')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .limit(1)
    if (salesError) throw salesError
    if (!salesRows || salesRows.length === 0) {
      throw new Error(
        'Missing sales record for signed-up Sales user — the ' +
          'on_auth_user_created trigger did not run. Did `npx supabase db reset` ' +
          'apply 0001_init.sql?',
      )
    }
    const salesId = (salesRows[0] as { id: string }).id

    // 4. Insert a Customer row the user owns (RLS INSERT: role=sales AND
    //    sales_id = get_user_sales_id())
    const customerCode = `SMK-${userId.slice(0, 8)}`
    const { error: insertError } = await client
      .from('customers')
      .insert({
        customer_code: customerCode,
        customer_name: 'Smoke Test Customer',
        sales_id: salesId,
        status: 'active',
      })
    if (insertError) throw insertError

    // 5. Read the owned Customer row back
    const { data: ownCustomer, error: selectError } = await client
      .from('customers')
      .select('customer_code, sales_id')
      .eq('customer_code', customerCode)
      .limit(1)
    if (selectError) throw selectError
    if (!ownCustomer || ownCustomer.length === 0) {
      throw new Error('Owned Customer row was not read back under RLS')
    }

    // 6. Clean up with the local service-role key (RLS-bypass).
    //    The auth.users row cannot be reached via Data API (the auth schema
    //    is not exposed); harmless to remain after a `db reset`.
    const serviceKey = getEnvServiceKey()
    const admin = createClient(url, serviceKey)

    await admin.from('customers').delete().eq('customer_code', customerCode)
    await admin.from('sales').delete().eq('user_id', userId)
    await admin.from('profiles').delete().eq('id', userId)

    expect(ownCustomer.length).toBeGreaterThanOrEqual(1)
    expect(ownCustomer[0].sales_id).toBe(salesId)
  })
})
