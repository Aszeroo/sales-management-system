import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardService } from '@/services/dashboard.service';
import { Card, CardStat } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PROJECT_STATUSES, STATUS_I18N_KEYS } from '@/lib/status';
import {
  Users,
  BriefcaseBusiness,
  FolderKanban,
  DollarSign,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { DashboardData, OrgDashboardData, OwnDashboardData } from '@/types';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, isAdmin, isManager } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadData();
    // oxlint-disable-next-line react/exhaustive-deps
  }, [isAdmin, isManager, user]);

  async function loadData() {
    try {
      setLoading(true);
      // The service decides the scope from the signed-in session: Sales gets
      // own-only aggregates, Manager/Admin get org-wide ones (issue #6).
      setDashboard(await dashboardService.getDashboardData());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      // Zeroed fallback of the right scope keeps the page renderable.
      setDashboard(
        isAdmin || isManager
          ? { scope: 'org', salesList: [], totalCustomers: 0, totalProjects: 0, totalBudget: 0 }
          : { scope: 'own', salesId: null, customers: [], projects: [] },
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  // Scope comes from the service, so the caption can never outlive the data:
  // org view (Manager/Admin) and own view (Sales) are separate renderings.
  if (dashboard?.scope === 'org') {
    return (
      <OrgDashboard
        data={dashboard}
        title={isAdmin ? t('dashboardAdmin.title') : t('dashboardOrg.title')}
      />
    );
  }
  if (dashboard?.scope === 'own') {
    return <SalesDashboard data={dashboard} t={t} />;
  }
  return null;
}

function OrgDashboard({
  data,
  title,
}: {
  data: OrgDashboardData;
  title: string;
}) {
  const { t } = useTranslation();

  const budgetBySales = data.salesList.map((s) => ({
    name: s.full_name,
    budget: s.total_budget || 0,
  }));

  const customersBySales = data.salesList.map((s) => ({
    name: s.full_name,
    count: s.customer_count || 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardStat
          label={t('dashboardAdmin.totalSales')}
          value={data.salesList.length}
          icon={<Users size={24} />}
          color="blue"
        />
        <CardStat
          label={t('dashboardAdmin.totalCustomers')}
          value={data.totalCustomers}
          icon={<BriefcaseBusiness size={24} />}
          color="green"
        />
        <CardStat
          label={t('dashboardAdmin.totalProjects')}
          value={data.totalProjects}
          icon={<FolderKanban size={24} />}
          color="purple"
        />
        <CardStat
          label={t('dashboardAdmin.totalBudget')}
          value={formatCurrency(data.totalBudget)}
          icon={<DollarSign size={24} />}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboardAdmin.budgetBySales')}</h3>
          {budgetBySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetBySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="budget" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboardAdmin.customersBySales')}</h3>
          {customersBySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={customersBySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function SalesDashboard({
  data,
  t,
}: {
  data: OwnDashboardData;
  t: (key: string) => string;
}) {
  // Everything below covers ONLY the signed-in Sales user's own customers and
  // the projects under them — the "my …" captions are true by construction.
  const myCustomers = data.customers;
  const myProjects = data.projects;

  // Compute status counts
  const statusCounts = myProjects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = PROJECT_STATUSES.map((status) => ({
    name: t(STATUS_I18N_KEYS[status]),
    value: statusCounts[status] || 0,
  })).filter((d) => d.value > 0);

  const totalBudget = myProjects.reduce((sum, p) => sum + (p.budget || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('dashboardSales.title')}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardStat
          label={t('dashboardSales.myCustomers')}
          value={myCustomers.length}
          icon={<BriefcaseBusiness size={24} />}
          color="green"
        />
        <CardStat
          label={t('dashboardSales.myProjects')}
          value={myProjects.length}
          icon={<FolderKanban size={24} />}
          color="blue"
        />
        <CardStat
          label={t('dashboardSales.myTotalBudget')}
          value={formatCurrency(totalBudget)}
          icon={<DollarSign size={24} />}
          color="orange"
        />
        <CardStat
          label={t('dashboardSales.projectStatusSummary')}
          value={myProjects.length}
          icon={<Users size={24} />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie Chart */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboardSales.projectStatusSummary')}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('common.noData')}</p>
          )}
        </Card>

        {/* Recent Projects */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboardSales.recentProjects')}</h3>
          {myProjects.length > 0 ? (
            <div className="space-y-3">
              {myProjects.slice(0, 5).map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{project.project_name}</p>
                    <p className="text-xs text-gray-500">{project.customer?.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={project.status} />
                    <p className="text-xs text-gray-500 mt-1">{formatDate(project.end_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('dashboardSales.noRecentProjects')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
