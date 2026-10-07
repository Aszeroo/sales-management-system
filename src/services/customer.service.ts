import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer, CustomerWithCounts } from '@/types';

/**
 * Creation input: every column except the generated/system ones. `sales_id`
 * (the Sales Owner) is optional on the wire — the DB auto-assigns it to the
 * inserting sales/manager user's own sales row when omitted (issue #4,
 * ADR-0001), and the Admin-only ownership rule is enforced by RLS.
 */
type CustomerCreateInput = Omit<
  Customer,
  'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sales_id'
> & {
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

    const results: CustomerWithCounts[] = [];
    for (const c of data || []) {
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
  },

  async getById(id: string, client: SupabaseClient = supabase): Promise<CustomerWithCounts | null> {
    const { data, error } = await client
      .from('customers')
      .select('*, sales:sales_id(id, full_name, sales_code)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    const { count: projectCount } = await client
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id)
      .is('deleted_at', null);

    const { data: projects } = await client
      .from('projects')
      .select('budget')
      .eq('customer_id', id)
      .is('deleted_at', null);

    const totalBudget = projects?.reduce((sum, p) => sum + (p.budget || 0), 0) || 0;

    return {
      ...data,
      project_count: projectCount || 0,
      total_budget: totalBudget,
      sales: data.sales as unknown as CustomerWithCounts['sales'],
    };
  },

  async getBySalesId(salesId: string, client: SupabaseClient = supabase): Promise<CustomerWithCounts[]> {
    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('sales_id', salesId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const results: CustomerWithCounts[] = [];
    for (const c of data || []) {
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
      });
    }

    return results;
  },

  async create(customerData: CustomerCreateInput, client: SupabaseClient = supabase): Promise<Customer> {
    const { data, error } = await client
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Customer>, client: SupabaseClient = supabase): Promise<Customer> {
    const { data, error } = await client
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
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
};
