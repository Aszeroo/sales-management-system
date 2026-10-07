/**
 * The audit stamp every UPDATE carries (issue #8): one helper builds the
 * `updated_at` payload so no service hand-writes the ISO call.
 */
export function touchUpdatedAt(): { updated_at: string } {
  return { updated_at: new Date().toISOString() };
}
