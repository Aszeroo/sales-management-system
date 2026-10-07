import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sales, SalesWithCounts } from '@/types';

export const salesService = {
  /**
   * Every sales row with per-owner Customer/Project counts. The client is
   * injectable like the other services' seams so tests (and the dashboard
   * service) can drive it with their own signed-in supabase-js client —
   * real RLS, no mocks (see src/tests/*).
   */
  async getAll(client: SupabaseClient = supabase): Promise<SalesWithCounts[]> {
    const { data, error } = await client
      .from('sales')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get counts and budgets for each sales
    const results: SalesWithCounts[] = [];
    for (const s of data || []) {
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
  },

  async getById(id: string): Promise<SalesWithCounts | null> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('sales_id', id)
      .is('deleted_at', null);

    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('sales_id', id)
      .is('deleted_at', null);

    const customerIds = customers?.map((c) => c.id) || [];

    let projectCount = 0;
    let totalBudget = 0;

    if (customerIds.length > 0) {
      const { count: pc } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .is('deleted_at', null);

      projectCount = pc || 0;

      const { data: projects } = await supabase
        .from('projects')
        .select('budget')
        .in('customer_id', customerIds)
        .is('deleted_at', null);

      totalBudget = projects?.reduce((sum, p) => sum + (p.budget || 0), 0) || 0;
    }

    return {
      ...data,
      customer_count: customerCount || 0,
      project_count: projectCount,
      total_budget: totalBudget,
    };
  },

  async create(salesData: Omit<Sales, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Sales> {
    const { data, error } = await supabase
      .from('sales')
      .insert(salesData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Sales>): Promise<Sales> {
    const { data, error } = await supabase
      .from('sales')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('sales')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', id);

    if (error) throw error;
  },

  async getByUserId(userId: string): Promise<Sales | null> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single();

    if (error) return null;
    return data;
  },

  /**
   * "The current user's sales row" — the ownership anchor of the 3-role
   * model (ADR-0001): Owner-capable users (sales, manager) have exactly one
   * active sales row created for them at signup; admin has none.
   *
   * Reads go through RLS, so this mirrors the DB helper `current_sales_id()`.
   * The client is injectable so tests can drive this seam with their own
   * signed-in supabase-js client (no mocks — RLS must be exercised for real).
   */
  async getCurrentUserSales(client: SupabaseClient = supabase): Promise<Sales | null> {
    const { data: userData } = await client.auth.getUser();
    if (!userData?.user) return null;

    const { data, error } = await client
      .from('sales')
      .select('*')
      .eq('user_id', userData.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) return null;
    return data;
  },
};
