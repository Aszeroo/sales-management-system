import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coerceUserRole, isSalesRole } from '@/lib/roles';
import type { DashboardData, OwnDashboardData, OrgDashboardData } from '@/types';
import { salesService } from '@/services/sales.service';
import { customerService } from '@/services/customer.service';
import { projectService } from '@/services/project.service';

/**
 * Role-true dashboard aggregates (issue #6).
 *
 * Scoping happens HERE, at the query layer — never by trimming an unfiltered
 * list: RLS returns every non-deleted row to every role (the read column of
 * the permission matrix), so slicing its first N rows would put org-wide
 * data under a "my …" caption. Sales aggregates query only the rows the
 * current user owns (ownership anchors on their sales row via
 * getCurrentUserSales, ADR-0001); Manager/Admin aggregates cover the whole
 * system.
 *
 * Every method takes an optional supabase-js client (defaults to the app's
 * singleton) so tests can drive the same seam with their own signed-in
 * client — real RLS, no mocks (see src/tests/*).
 */
export const dashboardService = {
  /**
   * The dashboard data for whoever is signed in on `client`. The role comes
   * from user metadata, mirroring the DB's get_user_role(): unknown/missing
   * metadata acts as 'sales', the most restrictive owner-capable role.
   */
  async getDashboardData(client: SupabaseClient = supabase): Promise<DashboardData> {
    const { data: userData } = await client.auth.getUser();
    // Mirror the DB's get_user_role(): unknown/missing metadata acts as
    // 'sales', the most restrictive owner-capable role.
    const role = coerceUserRole(userData?.user?.user_metadata?.role);

    if (isSalesRole(role)) {
      return this.getOwnDashboardData(client);
    }
    return this.getOrgDashboardData(client);
  },

  /**
   * Org-wide view (Manager/Admin): every sales row with its counts, plus
   * system-wide customer/project/budget totals.
   */
  async getOrgDashboardData(client: SupabaseClient = supabase): Promise<OrgDashboardData> {
    const [salesList, customers, projects] = await Promise.all([
      salesService.getAll(client),
      customerService.getAll(client),
      projectService.getAll(client),
    ]);

    return {
      scope: 'org',
      salesList,
      totalCustomers: customers.length,
      totalProjects: projects.length,
      totalBudget: projects.reduce((sum, p) => sum + (p.budget || 0), 0),
    };
  },

  /**
   * Own-scope view (Sales): only the current user's customers and the
   * projects under them. Both underlying queries filter by ownership in the
   * WHERE clause (customer.sales_id = the user's sales row; project.customer_id
   * ∈ those customers) — the same semantics the org view's per-sales charts use.
   */
  async getOwnDashboardData(client: SupabaseClient = supabase): Promise<OwnDashboardData> {
    const sales = await salesService.getCurrentUserSales(client);
    // No sales row → nothing is owned → an empty own-scope dashboard.
    if (!sales) {
      return { scope: 'own', salesId: null, customers: [], projects: [] };
    }

    const [customers, projects] = await Promise.all([
      customerService.getBySalesId(sales.id, client),
      projectService.getBySalesId(sales.id, client),
    ]);

    return { scope: 'own', salesId: sales.id, customers, projects };
  },
};
