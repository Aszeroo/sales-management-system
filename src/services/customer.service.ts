import { supabase } from '@/lib/supabase';
import type { Customer, CustomerWithCounts } from '@/types';

export const customerService = {
  async getAll(): Promise<CustomerWithCounts[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, sales:sales_id(id, full_name, sales_code)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const results: CustomerWithCounts[] = [];
    for (const c of data || []) {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', c.id)
        .is('deleted_at', null);

      const { data: projects } = await supabase
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

  async getById(id: string): Promise<CustomerWithCounts | null> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, sales:sales_id(id, full_name, sales_code)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    const { count: projectCount } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id)
      .is('deleted_at', null);

    const { data: projects } = await supabase
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

  async getBySalesId(salesId: string): Promise<CustomerWithCounts[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('sales_id', salesId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const results: CustomerWithCounts[] = [];
    for (const c of data || []) {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', c.id)
        .is('deleted_at', null);

      const { data: projects } = await supabase
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

  async create(customerData: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', id);

    if (error) throw error;
  },
};
