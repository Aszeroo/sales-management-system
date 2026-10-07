import { supabase } from '@/lib/supabase';
import { insertRow, updateRow } from '@/services/table';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, ProjectWithCustomer, SoftDeletable } from '@/types';

/**
 * Every method takes an optional supabase-js client (defaults to the app's
 * singleton) so tests can drive the same seam with their own signed-in
 * client — real RLS, no mocks (see src/tests/*).
 */

/** Normalizes the joined customer row (`customer:customers(...)`) to the ProjectWithCustomer shape. */
function withCustomer(rows: (Project & { customer?: unknown })[]): ProjectWithCustomer[] {
  return rows.map((p) => ({
    ...p,
    customer: p.customer as unknown as ProjectWithCustomer['customer'],
  }));
}

export const projectService = {
  async getAll(client: SupabaseClient = supabase): Promise<ProjectWithCustomer[]> {
    const { data, error } = await client
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code, sales_id)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return withCustomer(data || []);
  },

  async getById(id: string, client: SupabaseClient = supabase): Promise<ProjectWithCustomer | null> {
    const { data, error } = await client
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code, sales_id, contact_person, phone, email)')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    return withCustomer([data])[0] || null;
  },

  async getByCustomerId(customerId: string, client: SupabaseClient = supabase): Promise<Project[]> {
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(
    projectData: Omit<Project, 'id' | keyof SoftDeletable>,
    client: SupabaseClient = supabase,
  ): Promise<Project> {
    return insertRow<Project>(client, 'projects', projectData);
  },

  async update(id: string, updates: Partial<Project>, client: SupabaseClient = supabase): Promise<Project> {
    return updateRow<Project>(client, 'projects', id, updates);
  },

  async softDelete(id: string, client: SupabaseClient = supabase): Promise<void> {
    // Soft delete goes through the SECURITY DEFINER RPC (migration 0004),
    // the same pattern soft_delete_customer established in 0003: PostgreSQL
    // re-applies the SELECT policies to the new row of every UPDATE that
    // touches any column, so a plain UPDATE setting deleted_at makes the row
    // invisible to its own read policy and is rejected. The RPC enforces the
    // delete column of the matrix at the DB level — admin any row, sales
    // own-customer rows only (ownership joins through the customer,
    // ADR-0001), manager rejected outright.
    const { error } = await client.rpc('soft_delete_project', { p_project_id: id });

    if (error) throw error;
  },

  async getBySalesId(salesId: string, client: SupabaseClient = supabase): Promise<ProjectWithCustomer[]> {
    // First get customers for this sales, then get their projects
    const { data: customers } = await client
      .from('customers')
      .select('id')
      .eq('sales_id', salesId)
      .is('deleted_at', null);

    const customerIds = customers?.map((c) => c.id) || [];

    if (customerIds.length === 0) return [];

    const { data, error } = await client
      .from('projects')
      .select('*, customer:customers(id, customer_name, customer_code)')
      .in('customer_id', customerIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return withCustomer(data || []);
  },
};
