import { supabase } from '@/lib/supabase';
import type { Sales, SalesWithCounts } from '@/types';

export const salesService = {
  async getAll(): Promise<SalesWithCounts[]> {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get counts and budgets for each sales
    const results: SalesWithCounts[] = [];
    for (const s of data || []) {
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('sales_id', s.id)
        .is('deleted_at', null);

      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('sales_id', s.id)
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
};
