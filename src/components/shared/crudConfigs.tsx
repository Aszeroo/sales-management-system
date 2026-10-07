import type { CrudListConfig } from '@/components/shared/useCrudList';
import { customerService } from '@/services/customer.service';
import { projectService } from '@/services/project.service';
import { CUSTOMER_STATUSES, PROJECT_STATUSES, statusFilterOptions } from '@/lib/status';
import { CustomerFormModal } from '@/pages/customers/CustomerFormModal';
import { ProjectFormModal } from '@/pages/projects/ProjectFormModal';
import type { CustomerWithCounts, ProjectWithCustomer } from '@/types';

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

/**
 * The one customer/project CRUD config (issue #8): the admin pages and the
 * user-facing list pages share load/search/status/delete/form wiring for an
 * entity — only the page shell (title, create label, empty icon) and the
 * permission-gated card actions differ per page, so those stay with the page.
 */

/** The config keys the entity factories own; pages supply only the shell props. */
const CRUD_CONFIG_KEYS = [
  'load',
  'getId',
  'matchesSearch',
  'statusOptions',
  'statusOf',
  'deleteItem',
  'renderForm',
] as const;

export function customerCrudConfig(
  t: TFunc,
): Pick<CrudListConfig<CustomerWithCounts>, (typeof CRUD_CONFIG_KEYS)[number]> {
  return {
    load: () => customerService.getAll(),
    getId: (c) => c.id,
    matchesSearch: (c, q) =>
      c.customer_name.toLowerCase().includes(q) ||
      c.customer_code.toLowerCase().includes(q) ||
      c.company_name.toLowerCase().includes(q),
    statusOptions: statusFilterOptions(CUSTOMER_STATUSES, t),
    statusOf: (c) => c.status,
    deleteItem: (c) => customerService.softDelete(c.id),
    renderForm: (editing, close, onSaved) => (
      <CustomerFormModal isOpen onClose={close} onSuccess={onSaved} customer={editing} />
    ),
  };
}

export function projectCrudConfig(
  t: TFunc,
): Pick<CrudListConfig<ProjectWithCustomer>, (typeof CRUD_CONFIG_KEYS)[number]> {
  return {
    load: () => projectService.getAll(),
    getId: (p) => p.id,
    matchesSearch: (p, q) =>
      p.project_name.toLowerCase().includes(q) ||
      p.project_code.toLowerCase().includes(q) ||
      (p.customer?.customer_name?.toLowerCase().includes(q) ?? false),
    statusOptions: statusFilterOptions(PROJECT_STATUSES, t),
    statusOf: (p) => p.status,
    deleteItem: (p) => projectService.softDelete(p.id),
    renderForm: (editing, close, onSaved) => (
      <ProjectFormModal isOpen onClose={close} onSuccess={onSaved} project={editing} />
    ),
  };
}
