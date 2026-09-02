import { supabase } from '@/lib/supabase';
import type { Project, ProjectWithCustomer } from '@/types';

export const projectService = {
  async getAll(): Promise<ProjectWithCustomer[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code, sales_id)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((p) => ({
      ...p,
      customer: p.customer as unknown as ProjectWithCustomer['customer'],
    }));
  },

  async getById(id: string): Promise<ProjectWithCustomer | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code, sales_id, contact_person, phone, email)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    return {
      ...data,
      customer: data.customer as unknown as ProjectWithCustomer['customer'],
    };
  },

  async getByCustomerId(customerId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(projectData: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<Project>): Promise<Project> {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id);

    if (error) throw error;
  },

  async getBySalesId(salesId: string): Promise<ProjectWithCustomer[]> {
    // First get customers for this sales, then get their projects
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('sales_id', salesId)
      .is('deleted_at', null);

    const customerIds = customers?.map((c) => c.id) || [];

    if (customerIds.length === 0) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code)')
      .in('customer_id', customerIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((p) => ({
      ...p,
      customer: p.customer as unknown as ProjectWithCustomer['customer'],
    }));
  },
};
