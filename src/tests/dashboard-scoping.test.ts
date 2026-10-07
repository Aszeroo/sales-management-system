import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { getEnvUrl, getEnvAnonKey, getEnvServiceKey } from './helpers/env'
import { dashboardService } from '@/services/dashboard.service'
import { customerService } from '@/services/customer.service'
import { projectService } from '@/services/project.service'
import type { OrgDashboardData, OwnDashboardData, SalesWithCounts } from '@/types'

/**
 * Role-true dashboard (issue #6), exercised through the app's single seam:
 * services/supabase-js against the real local Supabase — no mocks. The
 * dashboard service must scope AT THE QUERY LAYER: a Sales user's aggregates
 * cover only their own customers/projects (ownership anchors on their sales
 * row, ADR-0001), Manager/Admin aggregates cover the whole system. Test
 * names mirror the acceptance criteria.
 *
 * Users of every role are seeded through the real signup path (the signup
 * trigger runs for real) before the assertions; cleanup uses the local
 * service-role key (RLS-bypass), mirroring the other suites. Other suites may
 * run in parallel against the same DB, so org-wide TOTALS are asserted with
 * >= deltas while every count tied to this suite's freshly-seeded users
 * (own-scope lists, per-sales chart rows) is asserted exactly.
 */

const PASSWORD = 'Dash-Password-123'

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
  const email = `dash-${role}-${rnd}@example.com`

  const { data, error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { role, full_name: `Dashboard ${role} ${rnd}`, ...extraMetadata },
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

async function customerIdByCode(code: string): Promise<string | null> {
  const admin = createClient(getEnvUrl(), getEnvServiceKey())
  const { data } = await admin.from('customers').select('id').eq('customer_code', code).limit(1)
  return (data?.[0] as { id: string } | undefined)?.id ?? null
}

async function ownDashboard(client: SupabaseClient): Promise<OwnDashboardData> {
  const d = await dashboardService.getDashboardData(client)
  if (d.scope !== 'own') throw new Error(`expected own-scope dashboard, got ${d.scope}`)
  return d
}

async function orgDashboard(client: SupabaseClient): Promise<OrgDashboardData> {
  const d = await dashboardService.getDashboardData(client)
  if (d.scope !== 'org') throw new Error(`expected org-scope dashboard, got ${d.scope}`)
  return d
}

function codesOf(rows: { customer_code?: string; project_code?: string }[]): string[] {
  return rows.map((r) => (r.customer_code ?? r.project_code) as string)
}

function ownBudget(d: OwnDashboardData): number {
  return d.projects.reduce((sum, p) => sum + (p.budget || 0), 0)
}

/** One per-sales row of the org charts ("Customers by Sales"/"Budget by Sales"). */
function salesRow(d: OrgDashboardData, salesId: string): SalesWithCounts {
  const row = d.salesList.find((s) => s.id === salesId)
  if (!row) throw new Error(`sales row ${salesId} missing from org dashboard`)
  return row
}

let customerAId: string
let customerBId: string

beforeAll(async () => {
  const rnd = crypto.randomUUID().slice(0, 8)
  users.salesA = await seedUser('sales', { sales_code: `DASHA-${rnd}`, username: `dasha-${rnd}` })
  users.salesB = await seedUser('sales', { sales_code: `DASHB-${rnd}`, username: `dashb-${rnd}` })
  users.manager = await seedUser('manager')
  users.admin = await seedUser('admin')

  // salesA owns two customers, salesB one; one project under each customer.
  // The manager also owns a fixture, so the org view is provably NOT the
  // manager's own scope (a wrongly own-scoped manager dashboard would show
  // exactly 1 customer, not everyone's).
  const codeA = `DASHA-C1-${rnd}`
  const codeA2 = `DASHA-C2-${rnd}`
  const codeB = `DASHB-C1-${rnd}`
  const codeM = `DASHM-C1-${rnd}`
  createdCustomerCodes.push(codeA, codeA2, codeB, codeM)

  await customerService.create(
    { ...baseCustomerInput(codeA), sales_id: users.salesA.salesId as string },
    users.salesA.client,
  )
  await customerService.create(
    { ...baseCustomerInput(codeA2), sales_id: users.salesA.salesId as string },
    users.salesA.client,
  )
  await customerService.create(
    { ...baseCustomerInput(codeB), sales_id: users.salesB.salesId as string },
    users.salesB.client,
  )
  await customerService.create(baseCustomerInput(codeM), users.manager.client)

  customerAId = (await customerIdByCode(codeA)) as string
  customerBId = (await customerIdByCode(codeB)) as string
  const customerMId = (await customerIdByCode(codeM)) as string

  const codePA = `DASHA-P1-${rnd}`
  const codePA2 = `DASHA-P2-${rnd}`
  const codePB = `DASHB-P1-${rnd}`
  const codePM = `DASHM-P1-${rnd}`
  createdProjectCodes.push(codePA, codePA2, codePB, codePM)
  await projectService.create(baseProjectInput(codePA, customerAId), users.salesA.client)
  await projectService.create(baseProjectInput(codePA2, customerAId), users.salesA.client)
  await projectService.create(baseProjectInput(codePB, customerBId), users.salesB.client)
  await projectService.create(baseProjectInput(codePM, customerMId), users.manager.client)
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

describe('Dashboard scoping per role (issue #6)', () => {
  test('sales: dashboard aggregates cover only own customers and projects (positive + negative)', async () => {
    const dashA = await ownDashboard(users.salesA.client)

    // Positive: BOTH of salesA's customers and both of salesA's projects.
    const customerCodesA = codesOf(dashA.customers)
    expect(customerCodesA).toContain(createdCustomerCodes[0])
    expect(customerCodesA).toContain(createdCustomerCodes[1])
    const projectCodesA = codesOf(dashA.projects)
    expect(projectCodesA).toContain(createdProjectCodes[0])
    expect(projectCodesA).toContain(createdProjectCodes[1])

    // Negative: the colleague's data must be absent — and since salesA is a
    // freshly seeded user, own-scope means EXACTLY these fixtures.
    expect(new Set(customerCodesA)).toEqual(
      new Set([createdCustomerCodes[0], createdCustomerCodes[1]]),
    )
    expect(new Set(projectCodesA)).toEqual(
      new Set([createdProjectCodes[0], createdProjectCodes[1]]),
    )
    expect(customerCodesA).not.toContain(createdCustomerCodes[2]) // salesB's
    expect(customerCodesA).not.toContain(createdCustomerCodes[3]) // manager's
    expect(projectCodesA).not.toContain(createdProjectCodes[2]) // salesB's
    expect(projectCodesA).not.toContain(createdProjectCodes[3]) // manager's

    // Own budget card: exactly the two own projects' budgets.
    expect(ownBudget(dashA)).toBe(2000)

    // Same truth for the second sales user, from their own session.
    const dashB = await ownDashboard(users.salesB.client)
    expect(new Set(codesOf(dashB.customers))).toEqual(new Set([createdCustomerCodes[2]]))
    expect(new Set(codesOf(dashB.projects))).toEqual(new Set([createdProjectCodes[2]]))
    expect(ownBudget(dashB)).toBe(1000)
  })

  test('manager: dashboard sees org-wide data (both sales users included)', async () => {
    const dashM = await orgDashboard(users.manager.client)

    // Org totals cover everyone: salesA (2 customers/2 projects), salesB
    // (1/1) and the manager's own fixture (1/1) must ALL be counted — an
    // own-scoped view for the manager would show exactly 1 customer.
    expect(dashM.totalCustomers).toBeGreaterThanOrEqual(4)
    expect(dashM.totalProjects).toBeGreaterThanOrEqual(4)
    expect(dashM.totalBudget).toBeGreaterThanOrEqual(4000)

    // The per-sales chart rows (fed by salesService.getAll through the
    // dashboard service) count this suite's users EXACTLY.
    const rowA = salesRow(dashM, users.salesA.salesId as string)
    expect(rowA.customer_count).toBe(2)
    expect(rowA.project_count).toBe(2)
    expect(rowA.total_budget).toBe(2000)
    const rowB = salesRow(dashM, users.salesB.salesId as string)
    expect(rowB.customer_count).toBe(1)
    expect(rowB.project_count).toBe(1)
    expect(rowB.total_budget).toBe(1000)
    const rowM = salesRow(dashM, users.manager.salesId as string)
    expect(rowM.customer_count).toBe(1)
    expect(rowM.project_count).toBe(1)
  })

  test('admin: dashboard sees org-wide data (both sales users included)', async () => {
    const dashAdm = await orgDashboard(users.admin.client)

    expect(dashAdm.totalCustomers).toBeGreaterThanOrEqual(4)
    expect(dashAdm.totalProjects).toBeGreaterThanOrEqual(4)
    expect(dashAdm.totalBudget).toBeGreaterThanOrEqual(4000)

    const rowA = salesRow(dashAdm, users.salesA.salesId as string)
    expect(rowA.customer_count).toBe(2)
    expect(rowA.project_count).toBe(2)
    const rowB = salesRow(dashAdm, users.salesB.salesId as string)
    expect(rowB.customer_count).toBe(1)
    expect(rowB.project_count).toBe(1)
    const rowM = salesRow(dashAdm, users.manager.salesId as string)
    expect(rowM.customer_count).toBe(1)
    expect(rowM.project_count).toBe(1)
  })

  test('creating a customer/project moves every role’s dashboard numbers correctly', async () => {
    const beforeA = await ownDashboard(users.salesA.client)
    const beforeM = await orgDashboard(users.manager.client)
    const beforeAdm = await orgDashboard(users.admin.client)

    // 1) salesA creates a new customer (auto-owned, migration 0003).
    const codeC = `DASHR-C-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(codeC)
    await customerService.create(baseCustomerInput(codeC), users.salesA.client)

    const midA = await ownDashboard(users.salesA.client)
    const midM = await orgDashboard(users.manager.client)
    const midAdm = await orgDashboard(users.admin.client)

    // Sales own cards move by exactly +1 customer, projects unchanged.
    expect(midA.customers.length).toBe(beforeA.customers.length + 1)
    expect(codesOf(midA.customers)).toContain(codeC)
    expect(midA.projects.length).toBe(beforeA.projects.length)

    // Org totals respond (>= delta — other suites may write concurrently);
    // the per-sales chart row for salesA moves by exactly +1.
    expect(midM.totalCustomers).toBeGreaterThanOrEqual(beforeM.totalCustomers + 1)
    expect(midAdm.totalCustomers).toBeGreaterThanOrEqual(beforeAdm.totalCustomers + 1)
    expect(salesRow(midM, users.salesA.salesId as string).customer_count).toBe(
      (salesRow(beforeM, users.salesA.salesId as string).customer_count ?? 0) + 1,
    )
    expect(salesRow(midAdm, users.salesA.salesId as string).customer_count).toBe(
      (salesRow(beforeAdm, users.salesA.salesId as string).customer_count ?? 0) + 1,
    )

    // 2) salesA creates a project under the new customer.
    const newCustomerId = await customerIdByCode(codeC)
    if (!newCustomerId) throw new Error('new customer not found after creation')
    const codeP = `DASHR-P-${crypto.randomUUID().slice(0, 8)}`
    createdProjectCodes.push(codeP)
    await projectService.create(baseProjectInput(codeP, newCustomerId), users.salesA.client)

    const afterA = await ownDashboard(users.salesA.client)
    const afterM = await orgDashboard(users.manager.client)
    const afterAdm = await orgDashboard(users.admin.client)

    expect(afterA.projects.length).toBe(midA.projects.length + 1)
    expect(codesOf(afterA.projects)).toContain(codeP)
    expect(ownBudget(afterA)).toBe(ownBudget(midA) + 1000)

    expect(afterM.totalProjects).toBeGreaterThanOrEqual(midM.totalProjects + 1)
    expect(afterM.totalBudget).toBeGreaterThanOrEqual(midM.totalBudget + 1000)
    expect(afterAdm.totalProjects).toBeGreaterThanOrEqual(midAdm.totalProjects + 1)
    expect(salesRow(afterM, users.salesA.salesId as string).project_count).toBe(
      (salesRow(midM, users.salesA.salesId as string).project_count ?? 0) + 1,
    )
    expect(salesRow(afterAdm, users.salesA.salesId as string).project_count).toBe(
      (salesRow(midAdm, users.salesA.salesId as string).project_count ?? 0) + 1,
    )
  })

  test('a colleague’s creation never moves a sales user’s own dashboard', async () => {
    const beforeA = await ownDashboard(users.salesA.client)

    // salesB creates a new own customer + project.
    const codeB2 = `DASHR-B-${crypto.randomUUID().slice(0, 8)}`
    createdCustomerCodes.push(codeB2)
    await customerService.create(baseCustomerInput(codeB2), users.salesB.client)
    const customerB2Id = await customerIdByCode(codeB2)
    if (!customerB2Id) throw new Error('salesB customer not found after creation')
    const codePB2 = `DASHR-BP-${crypto.randomUUID().slice(0, 8)}`
    createdProjectCodes.push(codePB2)
    await projectService.create(baseProjectInput(codePB2, customerB2Id), users.salesB.client)

    // salesA's own dashboard is unchanged — the "my …" numbers stay true.
    const afterA = await ownDashboard(users.salesA.client)
    expect(afterA.customers.length).toBe(beforeA.customers.length)
    expect(codesOf(afterA.customers)).not.toContain(codeB2)
    expect(afterA.projects.length).toBe(beforeA.projects.length)
    expect(codesOf(afterA.projects)).not.toContain(codePB2)

    // ...while salesB's own dashboard registers their own new rows.
    const afterB = await ownDashboard(users.salesB.client)
    expect(codesOf(afterB.customers)).toContain(codeB2)
    expect(codesOf(afterB.projects)).toContain(codePB2)
  })
})
