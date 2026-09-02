import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderKanban, DollarSign, Mail, Phone, MapPin } from 'lucide-react';
import { customerService } from '@/services/customer.service';
import { projectService } from '@/services/project.service';
import { Card, CardStat } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { CustomerWithCounts, Project } from '@/types';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerWithCounts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  async function loadData(customerId: string) {
    try {
      const [c, projs] = await Promise.all([
        customerService.getById(customerId),
        projectService.getByCustomerId(customerId),
      ]);
      setCustomer(c);
      setProjects(projs);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (!customer) return <EmptyState title={t('common.noData')} />;

  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{customer.customer_name}</h1>
        <StatusBadge status={customer.status} />
      </div>

      {/* Customer Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('customerDetail.customerInfo')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">{t('customerPage.customerCode')}</p>
            <p className="font-mono font-medium text-gray-900">{customer.customer_code}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('customerPage.customerName')}</p>
            <p className="font-medium text-gray-900">{customer.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('customerPage.companyName')}</p>
            <p className="font-medium text-gray-900">{customer.company_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('customerPage.contactPerson')}</p>
            <p className="font-medium text-gray-900">{customer.contact_person || '-'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">{t('common.email')}</p>
              <p className="font-medium text-gray-900">{customer.email || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">{t('common.phone')}</p>
              <p className="font-medium text-gray-900">{customer.phone || '-'}</p>
            </div>
          </div>
          {customer.address && (
            <div className="flex items-start gap-2 md:col-span-2">
              <MapPin size={14} className="text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">{t('common.address')}</p>
                <p className="font-medium text-gray-900">{customer.address}</p>
              </div>
            </div>
          )}
          {customer.description && (
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-sm text-gray-500">{t('common.description')}</p>
              <p className="text-gray-900">{customer.description}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CardStat
          label={t('salesDetail.projectCount')}
          value={projects.length}
          icon={<FolderKanban size={24} />}
          color="blue"
        />
        <CardStat
          label={t('salesDetail.totalBudget')}
          value={formatCurrency(totalBudget)}
          icon={<DollarSign size={24} />}
          color="green"
        />
        <CardStat
          label={t('common.status')}
          value={customer.status === 'active' ? t('common.active') : t('common.inactive')}
          icon={<FolderKanban size={24} />}
          color="purple"
        />
      </div>

      {/* Project List */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('customerDetail.projectList')}</h2>
        {projects.length === 0 ? (
          <EmptyState title={t('customerDetail.noProjects')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('projectPage.projectCode')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('projectPage.projectName')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('projectPage.budget')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('projectPage.startDate')}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                    {t('projectPage.endDate')}
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
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-mono text-gray-600">{p.project_code}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{p.project_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatCurrency(p.budget)}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.start_date)}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.end_date)}</td>
                    <td className="py-3 px-4"><StatusBadge status={p.status} /></td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/projects/${p.id}`}
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
