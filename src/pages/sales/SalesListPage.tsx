import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import { salesService } from '@/services/sales.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import type { SalesWithCounts } from '@/types';

export default function SalesListPage() {
  const { t } = useTranslation();
  const [sales, setSales] = useState<SalesWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    try {
      const data = await salesService.getAll();
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = sales.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.sales_code.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('salesPage.title')}</h1>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common.search')}
          className="w-full sm:w-80"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={t('common.noData')}
          description={t('common.noData')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    {s.sales_code}
                  </span>
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
        </div>
      )}
    </div>
  );
}
