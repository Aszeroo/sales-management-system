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
import { STATUS_I18N_KEYS } from '@/lib/status';
import { useDetailView } from '@/components/shared/useDetailView';
import type { CustomerWithCounts, Project } from '@/types';

/** One labeled detail field with the pages' shared `-` empty fallback. */
function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-medium text-gray-900">{value || '-'}</p>
    </div>
  );
}

function CustomerInfoCard({ customer }: { customer: CustomerWithCounts }) {
  const { t } = useTranslation();

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('customerDetail.customerInfo')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InfoField label={t('customerPage.customerCode')} value={customer.customer_code} />
        <InfoField label={t('customerPage.customerName')} value={customer.customer_name} />
        <InfoField label={t('customerPage.companyName')} value={customer.company_name} />
        <InfoField label={t('customerPage.contactPerson')} value={customer.contact_person} />
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-gray-400" />
          <InfoField label={t('common.email')} value={customer.email} />
        </div>
        <div className="flex items-center gap-2">
          <Phone size={14} className="text-gray-400" />
          <InfoField label={t('common.phone')} value={customer.phone} />
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
  );
}

function CustomerStats({
  customer,
  projects,
}: {
  customer: CustomerWithCounts;
  projects: Project[];
}) {
  const { t } = useTranslation();
  const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);

  return (
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
        value={t(STATUS_I18N_KEYS[customer.status])}
        icon={<FolderKanban size={24} />}
        color="purple"
      />
    </div>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();

  if (projects.length === 0) return <EmptyState title={t('customerDetail.noProjects')} />;

  return (
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
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading } = useDetailView(id, async (customerId) => {
    const [customer, projects] = await Promise.all([
      customerService.getById(customerId),
      projectService.getByCustomerId(customerId),
    ]);
    return { customer, projects };
  });
  const { customer, projects } = data ?? { customer: null, projects: [] as Project[] };

  if (loading) return <LoadingSpinner />;
  if (!customer) return <EmptyState title={t('common.noData')} />;

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
      <CustomerInfoCard customer={customer} />

      {/* Stats */}
      <CustomerStats customer={customer} projects={projects} />

      {/* Project List */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('customerDetail.projectList')}</h2>
        <ProjectTable projects={projects} />
      </Card>
    </div>
  );
}
