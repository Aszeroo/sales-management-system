import type { UserRole } from '@/types';
import { USER_ROLES } from '@/types';

/**
 * The role a user actually operates as. The role value comes from user
 * metadata; anything outside the 3-value vocabulary (or missing) behaves as
 * 'sales' — mirroring the DB's get_user_role(). AuthContext and every
 * service that scopes by role share this one coercion (issue #8).
 */
export function coerceUserRole(value: unknown): UserRole {
  return USER_ROLES.includes(value as UserRole) ? (value as UserRole) : 'sales';
}

/** Role comparisons go through these helpers instead of bare literals. */
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function isManagerRole(role: UserRole | null | undefined): boolean {
  return role === 'manager';
}

export function isSalesRole(role: UserRole | null | undefined): boolean {
  return role === 'sales';
}
