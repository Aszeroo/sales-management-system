import { supabase } from '@/lib/supabase';
import { insertRow, updateRow } from '@/services/table';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer, CustomerWithCounts, SoftDeletable } from '@/types';
import { coerceUserRole, isSalesRole } from '@/lib/roles';
import { enrichCustomers } from '@/services/enrichment';
import { salesService } from '@/services/sales.service';
import { CUSTOMER_STATUS_ACTIVE } from '@/lib/status';

/**
 * Creation input: every column except the generated/system ones. `sales_id`
 * (the Sales Owner) is optional on the wire — the DB auto-assigns it to the
 * inserting sales/manager user's own sales row when omitted (issue #4,
 * ADR-0001), and the Admin-only ownership rule is enforced by RLS.
 */
type CustomerCreateInput = Omit<Customer, 'id' | keyof SoftDeletable | 'sales_id'> & {
  sales_id?: string;
};

/**
 * Every method takes an optional supabase-js client (defaults to the app's
 * singleton) so tests can drive the same seam with their own signed-in
 * client — real RLS, no mocks (see src/tests/*).
 */
export const customerService = {
  async getAll(client: SupabaseClient = supabase): Promise<CustomerWithCounts[]> {
    const { data, error } = await client
      .from('customers')
      .select('*, sales:sales_id(id, full_name, sales_code)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return enrichCustomers(client, data || []);
  },

  async getById(id: string, client: SupabaseClient = supabase): Promise<CustomerWithCounts | null> {
    const { data, error } = await client
      .from('customers')
      .select('*, sales:sales_id(id, full_name, sales_code)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    const [enriched] = await enrichCustomers(client, [data]);
    return enriched || null;
  },

  async getBySalesId(salesId: string, client: SupabaseClient = supabase): Promise<CustomerWithCounts[]> {
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('sales_id', salesId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return enrichCustomers(client, data || []);
  },

  async create(customerData: CustomerCreateInput, client: SupabaseClient = supabase): Promise<Customer> {
    return insertRow<Customer>(client, 'customers', customerData);
  },

  async update(id: string, updates: Partial<Customer>, client: SupabaseClient = supabase): Promise<Customer> {
    return updateRow<Customer>(client, 'customers', id, updates);
  },

  async softDelete(id: string, client: SupabaseClient = supabase): Promise<void> {
    // Soft delete goes through the SECURITY DEFINER RPC (migration 0003):
    // PostgreSQL re-applies the SELECT policies to the new row of every
    // UPDATE that touches any column, so a plain UPDATE setting deleted_at
    // makes the row invisible to its own read policy and is rejected. The
    // RPC enforces the delete column of the matrix at the DB level — admin
    // any row, sales own rows only, manager rejected outright.
    const { error } = await client.rpc('soft_delete_customer', { p_customer_id: id });

    if (error) throw error;
  },

  /**
   * Customer options for the Project form (issue #5). A Sales user may
   * target only their own customers — filtered here at the query layer
   * (sales_id = the current user's sales row via getCurrentUserSales), never
   * by trimming the first N rows of an unfiltered list. Manager/Admin see
   * every active customer; the DB still enforces the same rule under RLS for
   * a direct API call.
   */
  async getOptionsForProjectForm(client: SupabaseClient = supabase): Promise<Customer[]> {
    const { data: userData } = await client.auth.getUser();
    // Mirror the DB's get_user_role(): unknown/missing metadata acts as
    // 'sales', the most restrictive owner-capable role.
    const role = coerceUserRole(userData?.user?.user_metadata?.role);

    if (isSalesRole(role)) {
      const sales = await salesService.getCurrentUserSales(client);
      // A sales user without a sales row sees no options at all.
      return sales ? this.getActiveCustomers(client, sales.id) : [];
    }
    return this.getActiveCustomers(client);
  },

  /**
   * Active, non-deleted customers, optionally scoped to one Sales Owner at
   * the query layer.
   */
  async getActiveCustomers(client: SupabaseClient = supabase, salesId?: string): Promise<Customer[]> {
    let query = client
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .eq('status', CUSTOMER_STATUS_ACTIVE);
    if (salesId) query = query.eq('sales_id', salesId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
