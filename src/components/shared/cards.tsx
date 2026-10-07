import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CodeChip, ItemActionRow } from '@/components/shared/list';
import type { CustomerWithCounts, ProjectWithCustomer } from '@/types';

/**
 * The one customer/project list card (issue #8): the admin pages and the
 * user-facing list pages render the same body — only the action row's
 * compactness (admin: labeled small row) and the permission-gated handlers
 * differ, so both sides pass those in instead of duplicating the markup.
 */

function CustomerCountRows({ customer }: { customer: CustomerWithCounts }) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex justify-between">
        <span>{t('salesPage.projects')}</span>
        <span className="text-gray-900 font-medium">{customer.project_count || 0}</span>
      </div>
      <div className="flex justify-between">
        <span>{t('salesDetail.totalBudget')}</span>
        <span className="text-gray-900 font-medium">{formatCurrency(customer.total_budget || 0)}</span>
      </div>
    </>
  );
}

function CustomerSalesRow({ customer, label }: { customer: CustomerWithCounts; label: string }) {
  const sales = customer.sales as { full_name?: string } | null | undefined;
  if (!sales) return null;

  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-gray-900">{sales.full_name || '-'}</span>
    </div>
  );
}

function CustomerDetailRows({
  customer,
  salesLabel,
}: {
  customer: CustomerWithCounts;
  salesLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 text-sm text-gray-600 mb-4">
      <div className="flex justify-between">
        <span>{t('customerPage.contactPerson')}</span>
        <span className="text-gray-900">{customer.contact_person || '-'}</span>
      </div>
      <CustomerCountRows customer={customer} />
      <CustomerSalesRow customer={customer} label={salesLabel} />
    </div>
  );
}

export function CustomerCard({
  customer,
  viewHref,
  onEdit,
  onDelete,
  compact = false,
  salesLabel,
}: {
  customer: CustomerWithCounts;
  viewHref: string;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
  /** The sales-owner row's label — the admin pages word it differently. */
  salesLabel: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <CodeChip code={customer.customer_code} />
        <StatusBadge status={customer.status} />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-1">{customer.customer_name}</h3>
      <p className="text-sm text-gray-500 mb-3">{customer.company_name}</p>

      <CustomerDetailRows customer={customer} salesLabel={salesLabel} />

      <ItemActionRow viewHref={viewHref} onEdit={onEdit} onDelete={onDelete} compact={compact} />
    </Card>
  );
}

export function ProjectCard({
  project,
  viewHref,
  onEdit,
  onDelete,
  compact = false,
}: {
  project: ProjectWithCustomer;
  viewHref: string;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <CodeChip code={project.project_code} />
        <StatusBadge status={project.status} />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-1">{project.project_name}</h3>
      <p className="text-sm text-gray-500 mb-3">{project.customer?.customer_name || '-'}</p>

      <div className="space-y-2 text-sm text-gray-600 mb-4">
        <div className="flex justify-between">
          <span>{t('projectPage.budget')}</span>
          <span className="text-gray-900 font-medium">{formatCurrency(project.budget)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('projectPage.startDate')}</span>
          <span className="text-gray-900">{formatDate(project.start_date)}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('projectPage.endDate')}</span>
          <span className="text-gray-900">{formatDate(project.end_date)}</span>
        </div>
      </div>

      <ItemActionRow viewHref={viewHref} onEdit={onEdit} onDelete={onDelete} compact={compact} />
    </Card>
  );
}
