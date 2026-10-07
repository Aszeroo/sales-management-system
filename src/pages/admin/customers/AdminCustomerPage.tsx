import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness } from 'lucide-react';
import { customerService } from '@/services/customer.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/utils';
import { CUSTOMER_STATUSES, statusFilterOptions } from '@/lib/status';
import { CrudListPage, CodeChip, ItemActionRow } from '@/components/shared/list';
import type { CustomerWithCounts } from '@/types';
import { CustomerFormModal } from '@/pages/customers/CustomerFormModal';

export default function AdminCustomerPage() {
  const { t } = useTranslation();

  return (
    <CrudListPage<CustomerWithCounts>
      title={t('adminCustomer.title')}
      createLabel={t('adminCustomer.addCustomer')}
      emptyIcon={<BriefcaseBusiness size={48} />}
      load={() => customerService.getAll()}
      getId={(c) => c.id}
      matchesSearch={(c, q) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_code.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q)
      }
      statusOptions={statusFilterOptions(CUSTOMER_STATUSES, t)}
      statusOf={(c) => c.status}
      deleteItem={(c) => customerService.softDelete(c.id)}
      renderForm={(editing, close, onSaved) => (
        <CustomerFormModal isOpen onClose={close} onSuccess={onSaved} customer={editing} />
      )}
      renderCard={(c, actions) => (
        <Card className="hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <CodeChip code={c.customer_code} />
            <StatusBadge status={c.status} />
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-1">{c.customer_name}</h3>
          <p className="text-sm text-gray-500 mb-3">{c.company_name}</p>

          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex justify-between">
              <span>{t('customerPage.contactPerson')}</span>
              <span className="text-gray-900">{c.contact_person || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('salesPage.projects')}</span>
              <span className="text-gray-900 font-medium">{c.project_count || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('salesDetail.totalBudget')}</span>
              <span className="text-gray-900 font-medium">{formatCurrency(c.total_budget || 0)}</span>
            </div>
            {c.sales && (
              <div className="flex justify-between">
                <span>{t('common.assignedTo')}</span>
                <span className="text-gray-900">{(c.sales as { full_name?: string })?.full_name || '-'}</span>
              </div>
            )}
          </div>

          <ItemActionRow viewHref={`/customers/${c.id}`} onEdit={actions.onEdit} onDelete={actions.onDelete} compact />
        </Card>
      )}
    />
  );
}
