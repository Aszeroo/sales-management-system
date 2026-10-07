import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness } from 'lucide-react';
import { CrudListPage } from '@/components/shared/list';
import { CustomerCard } from '@/components/shared/cards';
import { customerCrudConfig } from '@/components/shared/crudConfigs';
import type { CustomerWithCounts } from '@/types';

export default function AdminCustomerPage() {
  const { t } = useTranslation();

  return (
    <CrudListPage<CustomerWithCounts>
      {...customerCrudConfig(t)}
      title={t('adminCustomer.title')}
      createLabel={t('adminCustomer.addCustomer')}
      emptyIcon={<BriefcaseBusiness size={48} />}
      renderCard={(c, actions) => (
        <CustomerCard
          customer={c}
          viewHref={`/customers/${c.id}`}
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
          compact
          salesLabel={t('common.assignedTo')}
        />
      )}
    />
  );
}
