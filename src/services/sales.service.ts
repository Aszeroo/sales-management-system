import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sales } from '@/types';
import { enrichSales } from '@/services/enrichment';

export const salesService = {
  /**
   * Every sales row with per-owner Customer/Project counts. The client is
   * injectable like the other services' seams so tests (and the dashboard
   * service) can drive it with their own signed-in supabase-js client —
   * real RLS, no mocks (see src/tests/*).
   */
  async getAll(client: SupabaseClient = supabase) {
    const { data, error } = await client
      .from('sales')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Per-owner counts and budgets come from the shared enrichment helper.
    return enrichSales(client, data || []);
  },

  async getById(id: string, client: SupabaseClient = supabase) {
    const { data, error } = await client
      .from('sales')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;

    const [enriched] = await enrichSales(client, [data]);
    return enriched || null;
  },

  async getByUserId(userId: string, client: SupabaseClient = supabase): Promise<Sales | null> {
    const { data, error } = await client
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
