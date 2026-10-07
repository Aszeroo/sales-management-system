import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer, CustomerWithCounts, Sales, SalesWithCounts } from '@/types';

/**
 * Row-enrichment helpers shared by the services (issue #8): the per-row
 * aggregate queries (counts and budget sums) and the join-shape
 * normalization exist once here — no service re-implements them.
 *
 * Every helper takes the supabase-js client explicitly so tests (and other
 * services) drive the same seam with their own signed-in client — real RLS,
 * no mocks (see src/tests/*). The queries run per row exactly as before;
 * only the code is shared.
 */

/**
 * Attaches each Customer's project aggregates — the number of non-deleted
 * Projects under it and their total budget — and normalizes the joined
 * sales-owner row (`sales:sales_id(...)`) to the CustomerWithCounts shape.
 * Rows fetched without the sales join simply carry no owner.
 */
export async function enrichCustomers(
  client: SupabaseClient,
  rows: (Customer & { sales?: unknown })[],
): Promise<CustomerWithCounts[]> {
  const results: CustomerWithCounts[] = [];
  for (const c of rows) {
    const { count: projectCount } = await client
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', c.id)
      .is('deleted_at', null);

    const { data: projects } = await client
      .from('projects')
      .select('budget')
      .eq('customer_id', c.id)
      .is('deleted_at', null);

    const totalBudget = projects?.reduce((sum, p) => sum + (p.budget || 0), 0) || 0;

    results.push({
      ...c,
      project_count: projectCount || 0,
      total_budget: totalBudget,
      sales: c.sales as unknown as CustomerWithCounts['sales'],
    });
  }

  return results;
}

/**
 * Attaches each Sales row's ownership aggregates — its Customer count, the
 * Project count under those customers, and their total budget — producing
 * SalesWithCounts. A row with no customers gets zeroed aggregates without
 * touching the projects table (as before).
 */
export async function enrichSales(
  client: SupabaseClient,
  rows: Sales[],
): Promise<SalesWithCounts[]> {
  const results: SalesWithCounts[] = [];
  for (const s of rows) {
    const { count: customerCount } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('sales_id', s.id)
      .is('deleted_at', null);

    const { data: customers } = await client
      .from('customers')
      .select('id')
      .eq('sales_id', s.id)
      .is('deleted_at', null);

    const customerIds = customers?.map((c) => c.id) || [];

    let projectCount = 0;
    let totalBudget = 0;

    if (customerIds.length > 0) {
      const { count: pc } = await client
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .is('deleted_at', null);

      projectCount = pc || 0;

      const { data: projects } = await client
        .from('projects')
        .select('budget')
        .in('customer_id', customerIds)
        .is('deleted_at', null);

      totalBudget = projects?.reduce((sum, p) => sum + (p.budget || 0), 0) || 0;
    }

    results.push({
      ...s,
      customer_count: customerCount || 0,
      project_count: projectCount,
      total_budget: totalBudget,
    });
  }

  return results;
}
