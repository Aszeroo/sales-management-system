import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, FolderKanban, DollarSign } from 'lucide-react';
import { salesService } from '@/services/sales.service';
import { customerService } from '@/services/customer.service';
import { Card, CardStat } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import type { SalesWithCounts, CustomerWithCounts } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function SalesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [salesData, setSalesData] = useState<SalesWithCounts | null>(null);
  const [customers, setCustomers] = useState<CustomerWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  async function loadData(salesId: string) {
    try {
      const [s, custs] = await Promise.all([
        salesService.getById(salesId),
        customerService.getBySalesId(salesId),
      ]);
      setSalesData(s);
      setCustomers(custs);
    } catch (err) {
      console.error('Failed to load sales detail:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (!salesData) return <EmptyState title={t('common.noData')} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{salesData.full_name}</h1>
        <StatusBadge status={salesData.status} />
      </div>

      {/* Sales Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('salesDetail.salesInfo')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">{t('salesPage.salesCode')}</p>
            <p className="font-mono font-medium text-gray-900">{salesData.sales_code}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('adminSales.fullName')}</p>
            <p className="font-medium text-gray-900">{salesData.full_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('adminSales.username')}</p>
            <p className="font-medium text-gray-900">{salesData.username}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('adminSales.email')}</p>
            <p className="font-medium text-gray-900">{salesData.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('common.status')}</p>
            <StatusBadge status={salesData.status} />
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CardStat
          label={t('salesDetail.salesInfo')}
          value={salesData.customer_count || 0}
          icon={<Users size={24} />}
          color="blue"
        />
        <CardStat
          label={t('salesDetail.projectCount')}
          value={salesData.project_count || 0}
          icon={<FolderKanban size={24} />}
          color="green"
        />
        <CardStat
          label={t('salesDetail.totalBudget')}
          value={formatCurrency(salesData.total_budget || 0)}
          icon={<DollarSign size={24} />}
          color="orange"
        />
      </div>

      {/* Customer List */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('salesDetail.customerList')}</h2>
        {customers.length === 0 ? (
          <EmptyState title={t('salesDetail.noCustomers')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('customerPage.customerCode')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('customerPage.customerName')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('customerPage.companyName')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('salesPage.projects')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('salesDetail.totalBudget')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('common.status')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono text-gray-600">{c.customer_code}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{c.customer_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.company_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.project_count || 0}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatCurrency(c.total_budget || 0)}</td>
                    <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/customers/${c.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        {t('common.view')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
