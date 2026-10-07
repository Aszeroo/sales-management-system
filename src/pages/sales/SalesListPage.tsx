import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import { salesService } from '@/services/sales.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatCurrency } from '@/lib/utils';
import { CardGrid, CodeChip, ListPageHeader } from '@/components/shared/list';
import { useCrudList } from '@/components/shared/useCrudList';
import type { SalesWithCounts } from '@/types';

export default function SalesListPage() {
  const { t } = useTranslation();
  const list = useCrudList<SalesWithCounts>({
    load: () => salesService.getAll(),
    getId: (s) => s.id,
    matchesSearch: (s, q) =>
      s.full_name.toLowerCase().includes(q) ||
      s.sales_code.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q),
  });

  if (list.loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={t('salesPage.title')}
        headerExtra={
          <SearchInput
            value={list.search}
            onChange={list.setSearch}
            placeholder={t('common.search')}
            className="w-full sm:w-80"
          />
        }
      />

      {list.filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={t('common.noData')}
          description={t('common.noData')}
        />
      ) : (
        <CardGrid>
          {list.filtered.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <CodeChip code={s.sales_code} />
                </div>
                <StatusBadge status={s.status} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.full_name}</h3>

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>{t('salesPage.email')}</span>
                  <span className="text-gray-900">{s.email}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.customers')}</span>
                  <span className="text-gray-900 font-medium">{s.customer_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.projects')}</span>
                  <span className="text-gray-900 font-medium">{s.project_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.totalBudget')}</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(s.total_budget || 0)}</span>
                </div>
              </div>

              <Link
                to={`/sales/${s.id}`}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Eye size={16} />
                {t('common.view')}
              </Link>
            </Card>
          ))}
        </CardGrid>
      )}
    </div>
  );
}
