import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { projectService } from '@/services/project.service'
import { customerService } from '@/services/customer.service'

/**
 * Project permissions end-to-end per the Permission Matrix (issue #5),
 * exercised through the app's single seam: services/supabase-js against the
 * real local Supabase — no mocks, so RLS (migration 0004) is enforced for
 * real. Test names mirror the matrix cells.
 *
 * Users of every role are seeded through the real signup path (the signup
 * trigger runs for real) before the assertions; cleanup uses the local
 * service-role key (RLS-bypass), mirroring the other suites.
 */

const PASSWORD = 'Pr0j-Password-123'

interface SeededUser {
  userId: string
  salesId: string | null
  client: SupabaseClient
}

const users = {} as Record<'admin' | 'manager' | 'salesA' | 'salesB', SeededUser>
const createdUserIds: string[] = []
const createdCustomerCodes: string[] = []
const createdProjectCodes: string[] = []

// fallow-ignore-next-line complexity
async function seedUser(
  role: 'admin' | 'manager' | 'sales',
  extraMetadata: Record<string, unknown> = {},
): Promise<SeededUser> {
  const client = createClient(getEnvUrl(), getEnvAnonKey())
  const rnd = crypto.randomUUID().slice(0, 8)
  const email = `proj-${role}-${rnd}@example.com`

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `Project ${role} ${rnd}`, ...extraMetadata },
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
  await customerService.create({ ...baseCustomerInput(code), sales_id: salesId }, client)
}

function baseProjectInput(code: string, customerId: string) {
  return {
    project_code: code,
    project_name: `Project ${code}`,
    customer_id: customerId,
    description: '',
    budget: 1000,
    start_date: null,
    end_date: null,
    status: 'planning' as const,
  }
}

async function createProject(
  client: SupabaseClient,
  code: string,
  customerId: string,
): Promise<void> {
  createdProjectCodes.push(code)
  await projectService.create(baseProjectInput(code, customerId), client)
}

async function customerIdByCode(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin.from('customers').select('id').eq('customer_code', code).limit(1)
  return (data?.[0] as { id: string } | undefined)?.id ?? null
}

async function projectIdByCode(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin.from('projects').select('id').eq('project_code', code).limit(1)
  return (data?.[0] as { id: string } | undefined)?.id ?? null
}

async function projectDeletedAtOf(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin
    .from('projects')
    .select('deleted_at')
    .eq('project_code', code)
    .limit(1)
  return (data?.[0] as { deleted_at: string | null } | undefined)?.deleted_at ?? null
}

let customerAId: string // owned by salesA
let customerBId: string // owned by salesB

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `PRJTA-${rnd}`, username: `prjta-${rnd}` })
  users.salesB = await seedUser('sales', { sales_code: `PRJTB-${rnd}`, username: `prjtb-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  // Two customers for salesA and one for salesB, so cross-owner attempts
  // have targets and the form-scoping filter is proven positively (salesA's
  // options must contain BOTH of salesA's customers, not just lack rows).
  const codeA = `PRJTA-C-${rnd}`
  const codeA2 = `PRJTA2-C-${rnd}`
  const codeB = `PRJTB-C-${rnd}`
  await createCustomerWithOwner(users.salesA.client, codeA, users.salesA.salesId as string)
  await createCustomerWithOwner(users.salesA.client, codeA2, users.salesA.salesId as string)
  await createCustomerWithOwner(users.salesB.client, codeB, users.salesB.salesId as string)

  customerAId = (await customerIdByCode(codeA)) as string
  customerBId = (await customerIdByCode(codeB)) as string

  // One base project per sales user's customer, so cross-owner attempts
  // have targets.
  await createProject(users.salesA.client, `PRJTA-P-${rnd}`, customerAId)
  await createProject(users.salesB.client, `PRJTB-P-${rnd}`, customerBId)
})

afterAll(async () => {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  // Projects first — customers RESTRICT on live project references.
  await admin.from('projects').delete().in('project_code', createdProjectCodes)
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

describe('Project permissions per the matrix (issue #5)', () => {
  test('read: every role reads every non-deleted project', async () => {
    for (const u of Object.values(users)) {
      const rows = await projectService.getAll(u.client)
      const codes = rows.map((p) => p.project_code)
      expect(codes).toContain(createdProjectCodes[0]) // under salesA's customer
      expect(codes).toContain(createdProjectCodes[1]) // under salesB's customer
    }
  })

  test('create: manager can create under any customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    await createProject(users.manager.client, `PRJM-A-${rnd}`, customerAId)
    await createProject(users.manager.client, `PRJM-B-${rnd}`, customerBId)
  })

  test('create: sales can create under own customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    await createProject(users.salesA.client, `PRJSA-O-${rnd}`, customerAId)
  })

  test('create: sales cannot create under another sales’ customer via direct API (RLS)', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `PRJSA-X-${rnd}`
    createdProjectCodes.push(code)
    await expect(
      projectService.create(baseProjectInput(code, customerBId), users.salesA.client),
    ).rejects.toThrow()
    // nothing was created under the other user's customer
    expect(await projectIdByCode(code)).toBeNull()
  })

  test('create: admin can create under any customer', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    await createProject(users.admin.client, `PRJAD-A-${rnd}`, customerAId)
    await createProject(users.admin.client, `PRJAD-B-${rnd}`, customerBId)
  })

  test('update: manager can update any project', async () => {
    const code = createdProjectCodes[0] // under salesA's customer
    const updated = await projectService.update(
      (await projectIdByCode(code)) as string,
      { project_name: `Manager renamed ${code}` },
      users.manager.client,
    )
    expect(updated.project_name).toBe(`Manager renamed ${code}`)
  })

  test('update: admin can update any project', async () => {
    // Issue #19: Admin's FOR ALL on projects was split into SELECT/INSERT/
    // UPDATE policies — this guards that UPDATE (the whole write path minus
    // hard DELETE) is still fully open to Admin. Closes the update-cell gap
    // left by the original issue #5 acceptance criteria.
    const code = createdProjectCodes[1] // under salesB's customer — Admin owns nothing
    const updated = await projectService.update(
      (await projectIdByCode(code)) as string,
      { project_name: `Admin renamed ${code}` },
      users.admin.client,
    )
    expect(updated.project_name).toBe(`Admin renamed ${code}`)
  })

  test('update: manager cannot soft delete via a plain UPDATE (no delete right)', async () => {
    const code = createdProjectCodes[1] // under salesB's customer
    await expect(
      projectService.update(
        (await projectIdByCode(code)) as string,
        { deleted_at: new Date().toISOString() },
        users.manager.client,
      ),
    ).rejects.toThrow()
    expect(await projectDeletedAtOf(code)).toBeNull()
  })

  test('update: sales can update own-customer project', async () => {
    const code = createdProjectCodes[0]
    const updated = await projectService.update(
      (await projectIdByCode(code)) as string,
      { project_name: `Sales renamed ${code}` },
      users.salesA.client,
    )
    expect(updated.project_name).toBe(`Sales renamed ${code}`)
  })

  test('update: sales cannot update another sales’ project', async () => {
    const code = createdProjectCodes[1] // under salesB's customer
    await expect(
      projectService.update(
        (await projectIdByCode(code)) as string,
        { project_name: 'Sales hijack' },
        users.salesA.client,
      ),
    ).rejects.toThrow()
  })

  test('update: sales cannot move a project to another sales’ customer', async () => {
    const code = createdProjectCodes[0] // under salesA's customer
    await expect(
      projectService.update(
        (await projectIdByCode(code)) as string,
        { customer_id: customerBId },
        users.salesA.client,
      ),
    ).rejects.toThrow()
  })

  test('delete: manager cannot delete (RPC rejects)', async () => {
    const code = createdProjectCodes[1]
    await expect(
      projectService.softDelete((await projectIdByCode(code)) as string, users.manager.client),
    ).rejects.toThrow()
    // the row is still alive for everyone
    const rows = await projectService.getAll(users.salesB.client)
    expect(rows.map((p) => p.project_code)).toContain(code)
  })

  test('delete: sales can soft-delete own-customer project', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `PRJSD-O-${rnd}`
    await createProject(users.salesA.client, code, customerAId)

    await projectService.softDelete((await projectIdByCode(code)) as string, users.salesA.client)
    expect(await projectDeletedAtOf(code)).not.toBeNull()

    const rows = await projectService.getAll(users.salesA.client)
    expect(rows.map((p) => p.project_code)).not.toContain(code)
  })

  test('delete: sales cannot delete another sales’ project', async () => {
    const code = createdProjectCodes[1]
    await expect(
      projectService.softDelete((await projectIdByCode(code)) as string, users.salesA.client),
    ).rejects.toThrow()
    const rows = await projectService.getAll(users.salesB.client)
    expect(rows.map((p) => p.project_code)).toContain(code)
  })

  test('delete: admin can delete any project', async () => {
    const rnd = crypto.randomUUID().slice(0, 8)
    const code = `PRJDA-A-${rnd}`
    await createProject(users.admin.client, code, customerBId)

    await projectService.softDelete((await projectIdByCode(code)) as string, users.admin.client)
    expect(await projectDeletedAtOf(code)).not.toBeNull()
  })

  test('form scoping: sales option list contains only own customers', async () => {
    // Positive + negative proof: salesA owns TWO customers here — both must
    // appear; salesB's customer must never appear.
    const optionsA = await customerService.getOptionsForProjectForm(users.salesA.client)
    const codesA = optionsA.map((c) => c.customer_code)
    expect(codesA).toContain(createdCustomerCodes[0]) // salesA's 1st customer
    expect(codesA).toContain(createdCustomerCodes[1]) // salesA's 2nd customer
    expect(codesA).not.toContain(createdCustomerCodes[2]) // salesB's customer

    // Manager/Admin see every active customer as options.
    const optionsManager = await customerService.getOptionsForProjectForm(users.manager.client)
    expect(optionsManager.map((c) => c.customer_code)).toContain(createdCustomerCodes[2])
    const optionsAdmin = await customerService.getOptionsForProjectForm(users.admin.client)
    expect(optionsAdmin.map((c) => c.customer_code)).toContain(createdCustomerCodes[0])
    expect(optionsAdmin.map((c) => c.customer_code)).toContain(createdCustomerCodes[2])
  })
})
