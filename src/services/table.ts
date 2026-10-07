import type { SupabaseClient } from '@supabase/supabase-js';
import { touchUpdatedAt } from '@/lib/audit';

/**
 * The single-row write shape both editable services use (issue #8): INSERT
 * or UPDATE returning the saved row, with the shared audit stamp on every
 * UPDATE. The injectable client keeps the test seam intact.
 */
export async function insertRow<T>(client: SupabaseClient, table: string, values: unknown): Promise<T> {
  const { data, error } = await client.from(table).insert(values).select().single();
  if (error) throw error;
  return data as T;
}

export async function updateRow<T>(
  client: SupabaseClient,
  table: string,
  id: string,
  updates: unknown,
): Promise<T> {
  const { data, error } = await client
    .from(table)
    .update({ ...(updates as Record<string, unknown>), ...touchUpdatedAt() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as T;
}
