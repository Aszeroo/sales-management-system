import type { UserRole } from '@/types';
import { isAdminRole, isManagerRole, isSalesRole } from '@/lib/roles';

/**
 * The Permission Matrix as one shared module (issue #22, parent PRD #18).
 * Every UI role gate asks these pure functions instead of restating
 * `isAdmin || isManager …` cascades page by page — a rule change is a single
 * edit here, and the README "Permission Matrix" table stays the spec this
 * file mirrors. "Delete" means the Soft Delete RPC path only.
 *
 * Role-only by design: `role` is the signed-in user's role (null/undefined =
 * not signed in → nothing allowed, mirroring the AuthContext booleans), and
 * "own" facts (row.sales_id === mySalesId) are computed by the caller. No
 * Supabase access happens here; the DB enforces the same cells independently
 * through RLS policies and SECURITY DEFINER RPCs.
 */

/**
 * Vocabulary cell (CONTEXT.md "Owner-capable"): Sales and Manager only —
 * Admin is never a Sales Owner.
 */
export function isOwnerCapable(role: UserRole | null | undefined): boolean {
  return isManagerRole(role) || isSalesRole(role);
}

/**
 * Invariant "every Customer must always have a Sales Owner" (README): a role
 * change out of an Owner-capable role strips the user's ownership — the
 * Users page warns about the owned count before the RPC proceeds.
 */
export function losesOwnerCapability(
  fromRole: UserRole | null | undefined,
  toRole: UserRole | null | undefined,
): boolean {
  return isOwnerCapable(fromRole) && !isOwnerCapable(toRole);
}

/**
 * Matrix row "Create Customer": every role may create — Admin sets the Sales
 * Owner itself, Manager picks or auto-owns, Sales is auto-owned. The create
 * button shows for all three roles.
 */
export function canCreateCustomers(role: UserRole | null | undefined): boolean {
  return isAdminRole(role) || isManagerRole(role) || isSalesRole(role);
}

/**
 * Matrix row "Edit Customer": Admin any, Manager any (Sales Owner stays
 * read-only on the form), Sales only their own customers.
 */
export function canEditCustomers(
  role: UserRole | null | undefined,
  isOwnCustomer: boolean,
): boolean {
  return isAdminRole(role) || isManagerRole(role) || (isSalesRole(role) && isOwnCustomer);
}

/**
 * Matrix row "Delete Customer (soft delete)": Admin any, Manager NEVER,
 * Sales only their own customers.
 */
export function canDeleteCustomers(
  role: UserRole | null | undefined,
  isOwnCustomer: boolean,
): boolean {
  return isAdminRole(role) || (isSalesRole(role) && isOwnCustomer);
}

/**
 * Matrix row "Create Project": Admin/Manager under any Customer, Sales only
 * under their own customers — the create form filters the customer picker,
 * so the button itself shows for all three roles.
 */
export function canCreateProjects(role: UserRole | null | undefined): boolean {
  return isAdminRole(role) || isManagerRole(role) || isSalesRole(role);
}

/**
 * Matrix row "Edit Project": Admin any, Manager any, Sales only projects
 * under their own customers. `isOwnCustomer` = the project's Customer belongs
 * to the caller's sales row.
 */
export function canEditProjects(
  role: UserRole | null | undefined,
  isOwnCustomer: boolean,
): boolean {
  return isAdminRole(role) || isManagerRole(role) || (isSalesRole(role) && isOwnCustomer);
}

/**
 * Matrix row "Delete Project (soft delete)": Admin any, Manager NEVER,
 * Sales only projects under their own customers.
 */
export function canDeleteProjects(
  role: UserRole | null | undefined,
  isOwnCustomer: boolean,
): boolean {
  return isAdminRole(role) || (isSalesRole(role) && isOwnCustomer);
}

/**
 * Matrix row "Dashboard": Manager/Admin see the org-wide scope, Sales their
 * own scope. No signed-in role falls back to 'own'.
 */
export function dashboardScope(role: UserRole | null | undefined): 'org' | 'own' {
  return isAdminRole(role) || isManagerRole(role) ? 'org' : 'own';
}
