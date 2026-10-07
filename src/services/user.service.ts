import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagedUser, UserRole } from '@/types';

/**
 * User creation input for the unified users page (issue #7): the Admin
 * picks any of the 3 roles; the SECURITY DEFINER RPC `admin_create_user`
 * creates the auth user + profile and the signup trigger adds the sales row
 * iff the role is owner-capable (ADR-0001).
 */
export interface UserCreateInput {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

/**
 * Every account operation goes through a SECURITY DEFINER RPC that verifies
 * the caller is Admin — never client-side signUp/session juggling and never
 * a service-role key in the frontend (ADR-0001).
 *
 * The client is injectable like the other services' seams so tests can drive
 * the same path with their own signed-in supabase-js client — real RLS, no
 * mocks (see src/tests/*).
 */
export const userService = {
  /** Every User of every role, admins included, with the real ban state. */
  async getAll(client: SupabaseClient = supabase): Promise<ManagedUser[]> {
    const { data, error } = await client.rpc('admin_list_users');

    if (error) throw error;
    return (data || []) as unknown as ManagedUser[];
  },

  /** Creates the User; returns the new auth user id. */
  async create(input: UserCreateInput, client: SupabaseClient = supabase): Promise<string> {
    const { data, error } = await client.rpc('admin_create_user', {
      p_email: input.email,
      p_password: input.password,
      p_full_name: input.full_name,
      p_role: input.role,
    });

    if (error) throw error;
    return data as string;
  },

  async resetPassword(
    userId: string,
    newPassword: string,
    client: SupabaseClient = supabase
  ): Promise<void> {
    const { error } = await client.rpc('admin_reset_password', {
      p_user_id: userId,
      p_new_password: newPassword,
    });

    if (error) throw error;
  },

  /**
   * Deactivate (active = false) is a REAL ban: the user cannot sign in while
   * deactivated. Rejected with the owned-customer count when the user is
   * still a Sales Owner — reassign first (ADR-0001).
   */
  async setActive(userId: string, active: boolean, client: SupabaseClient = supabase): Promise<void> {
    const { error } = await client.rpc('admin_set_user_active', {
      p_user_id: userId,
      p_active: active,
    });

    if (error) throw error;
  },

  /**
   * Sales <-> Manager is unrestricted; moving a Sales Owner up to admin is
   * rejected with the owned-customer count until their customers are
   * reassigned (ADR-0001).
   */
  async changeRole(userId: string, newRole: UserRole, client: SupabaseClient = supabase): Promise<void> {
    const { error } = await client.rpc('admin_change_role', {
      p_user_id: userId,
      p_new_role: newRole,
    });

    if (error) throw error;
  },

  /**
   * The advance warning: how many active Customers this user still owns.
   * The users page fetches this BEFORE offering deactivate / promote-to-admin.
   */
  async getPendingReassignmentCount(userId: string, client: SupabaseClient = supabase): Promise<number> {
    const { data, error } = await client.rpc('admin_pending_reassignment_count', {
      p_user_id: userId,
    });

    if (error) throw error;
    return (data as number | null) ?? 0;
  },
};
