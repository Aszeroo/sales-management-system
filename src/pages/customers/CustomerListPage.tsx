import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMySalesId } from '@/components/shared/useMySalesId';
import { CrudListPage } from '@/components/shared/list';
import { CustomerCard } from '@/components/shared/cards';
import { customerCrudConfig } from '@/components/shared/crudConfigs';
import type { CustomerWithCounts } from '@/types';

export default function CustomerListPage() {
  const { t } = useTranslation();
  const { isAdmin, isManager, isSales } = useAuth();
  // Permission Matrix (issue #4): every role can create/edit customers here —
  // Sales Owner changes are Admin-only (read-only field on the form) and
  // deletion is Admin/Sales-only, so the buttons below are gated separately.
  const canManageCustomers = isAdmin || isManager || isSales;
  const mySalesId = useMySalesId();

  return (
    <CrudListPage<CustomerWithCounts>
      {...customerCrudConfig(t)}
      title={t('customerPage.title')}
      createLabel={canManageCustomers ? t('customerPage.addCustomer') : undefined}
      emptyIcon={<BriefcaseBusiness size={48} />}
      renderCard={(c, actions) => (
        <CustomerCard
          customer={c}
          viewHref={`/customers/${c.id}`}
          onEdit={
            canManageCustomers && (isAdmin || isManager || c.sales_id === mySalesId)
              ? actions.onEdit
              : undefined
          }
          onDelete={
            isAdmin || (isSales && c.sales_id === mySalesId) ? actions.onDelete : undefined
          }
          salesLabel={t('customerPage.salesOwner')}
        />
      )}
    />
  );
}
