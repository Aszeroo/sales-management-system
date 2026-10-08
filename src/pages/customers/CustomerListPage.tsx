import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMySalesId } from '@/components/shared/useMySalesId';
import { CrudListPage } from '@/components/shared/list';
import { CustomerCard } from '@/components/shared/cards';
import { customerCrudConfig } from '@/components/shared/crudConfigs';
import {
  canCreateCustomers,
  canDeleteCustomers,
  canEditCustomers,
} from '@/lib/permissions';
import type { CustomerWithCounts } from '@/types';

export default function CustomerListPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;
  // Permission Matrix (issue #4) — the cells live in lib/permissions (#22):
  // every role can create/edit customers here — Sales Owner changes are
  // Admin-only (read-only field on the form) and deletion is Admin/Sales-only,
  // so the buttons below are gated separately.
  const mySalesId = useMySalesId();

  return (
    <CrudListPage<CustomerWithCounts>
      {...customerCrudConfig(t)}
      title={t('customerPage.title')}
      createLabel={canCreateCustomers(role) ? t('customerPage.addCustomer') : undefined}
      emptyIcon={<BriefcaseBusiness size={48} />}
      renderCard={(c, actions) => (
        <CustomerCard
          customer={c}
          viewHref={`/customers/${c.id}`}
          onEdit={
            canEditCustomers(role, c.sales_id === mySalesId) ? actions.onEdit : undefined
          }
          onDelete={
            canDeleteCustomers(role, c.sales_id === mySalesId) ? actions.onDelete : undefined
          }
          salesLabel={t('customerPage.salesOwner')}
        />
      )}
    />
  );
}
