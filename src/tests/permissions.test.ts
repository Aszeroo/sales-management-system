import { describe, expect, test } from 'vitest'
import { USER_ROLES } from '@/types'
import type { UserRole } from '@/types'
import {
  canCreateCustomers,
  canCreateProjects,
  canDeleteCustomers,
  canDeleteProjects,
  canEditCustomers,
  canEditProjects,
  dashboardScope,
  isOwnerCapable,
  losesOwnerCapability,
} from '@/lib/permissions'

/**
 * Unit tests for the shared Permission Matrix helper (issue #22). Each block
 * mirrors one README "Permission Matrix" row (create / edit / delete per
 * role, own-vs-any where the matrix distinguishes) plus the CONTEXT.md
 * Owner-capable vocabulary cell. Pure functions — no Supabase, no DOM.
 */

describe('isOwnerCapable (CONTEXT.md vocabulary cell)', () => {
  test('Sales and Manager are Owner-capable', () => {
    expect(isOwnerCapable('sales')).toBe(true)
    expect(isOwnerCapable('manager')).toBe(true)
  })

  test('Admin is never Owner-capable', () => {
    expect(isOwnerCapable('admin')).toBe(false)
  })

  test('no signed-in role is not Owner-capable', () => {
    expect(isOwnerCapable(undefined)).toBe(false)
    expect(isOwnerCapable(null)).toBe(false)
  })
})

describe('losesOwnerCapability ("every Customer keeps a Sales Owner")', () => {
  // The guard fires exactly on Manager/Sales → Admin (the Users page's
  // reassignment warning), never on other transitions within USER_ROLES.
  const cells: Array<[UserRole, UserRole, boolean]> = [
    ['manager', 'admin', true],
    ['sales', 'admin', true],
    ['admin', 'admin', false],
    ['admin', 'manager', false],
    ['admin', 'sales', false],
    ['manager', 'sales', false],
    ['sales', 'manager', false],
    ['manager', 'manager', false],
    ['sales', 'sales', false],
  ]
  for (const [from, to, expected] of cells) {
    test(`${from} → ${to}: ${expected}`, () => {
      expect(losesOwnerCapability(from, to)).toBe(expected)
    })
  }
})

describe('Customer matrix rows', () => {
  test('create — every signed-in role may create', () => {
    for (const role of USER_ROLES) {
      expect(canCreateCustomers(role)).toBe(true)
    }
    expect(canCreateCustomers(undefined)).toBe(false)
  })

  test('edit — Admin/Manager any, Sales only their own customers', () => {
    expect(canEditCustomers('admin', false)).toBe(true)
    expect(canEditCustomers('manager', false)).toBe(true)
    expect(canEditCustomers('sales', true)).toBe(true)
    expect(canEditCustomers('sales', false)).toBe(false)
    expect(canEditCustomers(undefined, true)).toBe(false)
  })

  test('delete — Admin any, Manager NEVER, Sales only their own customers', () => {
    expect(canDeleteCustomers('admin', false)).toBe(true)
    expect(canDeleteCustomers('manager', true)).toBe(false)
    expect(canDeleteCustomers('sales', true)).toBe(true)
    expect(canDeleteCustomers('sales', false)).toBe(false)
    expect(canDeleteCustomers(undefined, true)).toBe(false)
  })
})

describe('Project matrix rows', () => {
  test('create — every signed-in role may create', () => {
    for (const role of USER_ROLES) {
      expect(canCreateProjects(role)).toBe(true)
    }
    expect(canCreateProjects(undefined)).toBe(false)
  })

  test('edit — Admin/Manager any, Sales only under their own customers', () => {
    expect(canEditProjects('admin', false)).toBe(true)
    expect(canEditProjects('manager', false)).toBe(true)
    expect(canEditProjects('sales', true)).toBe(true)
    expect(canEditProjects('sales', false)).toBe(false)
    expect(canEditProjects(undefined, true)).toBe(false)
  })

  test('delete — Admin any, Manager NEVER, Sales only under their own customers', () => {
    expect(canDeleteProjects('admin', false)).toBe(true)
    expect(canDeleteProjects('manager', true)).toBe(false)
    expect(canDeleteProjects('sales', true)).toBe(true)
    expect(canDeleteProjects('sales', false)).toBe(false)
    expect(canDeleteProjects(undefined, true)).toBe(false)
  })
})

describe('dashboardScope (Dashboard row)', () => {
  test('Admin and Manager see the org-wide scope', () => {
    expect(dashboardScope('admin')).toBe('org')
    expect(dashboardScope('manager')).toBe('org')
  })

  test('Sales — and a missing role — get the own scope', () => {
    expect(dashboardScope('sales')).toBe('own')
    expect(dashboardScope(undefined)).toBe('own')
    expect(dashboardScope(null)).toBe('own')
  })
})
