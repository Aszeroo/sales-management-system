import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { salesService } from '@/services/sales.service';
import { customerService } from '@/services/customer.service';
import { projectService } from '@/services/project.service';
import { Card, CardStat } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
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
import type { SalesWithCounts, ProjectWithCustomer } from '@/types';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);

  // Admin data
  const [salesList, setSalesList] = useState<SalesWithCounts[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);

  // Sales data
  const [myProjects, setMyProjects] = useState<ProjectWithCustomer[]>([]);

  useEffect(() => {
    loadData();
  }, [isAdmin, user]);

  async function loadData() {
    try {
      setLoading(true);
      if (isAdmin) {
        const [sales, customers, projects] = await Promise.all([
          salesService.getAll(),
          customerService.getAll(),
          projectService.getAll(),
        ]);
        setSalesList(sales);
        setTotalCustomers(customers.length);
        setTotalProjects(projects.length);
        setTotalBudget(projects.reduce((sum, p) => sum + (p.budget || 0), 0));
      } else {
        // Sales user - get their own data
        const projects = await projectService.getAll();
        // Filter projects for this sales user's customers
        // For now, we use the RLS to filter
        setMyProjects(projects.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (isAdmin) {
    return <AdminDashboard salesList={salesList} totalCustomers={totalCustomers} totalProjects={totalProjects} totalBudget={totalBudget} t={t} />;
  }

  return <SalesDashboard myProjects={myProjects} t={t} />;
}

function AdminDashboard({
  salesList,
  totalCustomers,
  totalProjects,
  totalBudget,
  t,
}: {
  salesList: SalesWithCounts[];
  totalCustomers: number;
  totalProjects: number;
  totalBudget: number;
  t: (key: string) => string;
}) {
  const budgetBySales = salesList.map((s) => ({
    name: s.full_name,
    budget: s.total_budget || 0,
  }));

  const customersBySales = salesList.map((s) => ({
    name: s.full_name,
    count: s.customer_count || 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('dashboardAdmin.title')}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardStat
          label={t('dashboardAdmin.totalSales')}
          value={salesList.length}
          icon={<Users size={24} />}
          color="blue"
        />
        <CardStat
          label={t('dashboardAdmin.totalCustomers')}
          value={totalCustomers}
          icon={<BriefcaseBusiness size={24} />}
          color="green"
        />
        <CardStat
          label={t('dashboardAdmin.totalProjects')}
          value={totalProjects}
          icon={<FolderKanban size={24} />}
          color="purple"
        />
        <CardStat
          label={t('dashboardAdmin.totalBudget')}
          value={formatCurrency(totalBudget)}
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
  myProjects,
  t,
}: {
  myProjects: ProjectWithCustomer[];
  t: (key: string) => string;
}) {
  // Compute status counts
  const statusCounts = myProjects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = [
    { name: t('projectPage.planning'), value: statusCounts['planning'] || 0 },
    { name: t('projectPage.inProgress'), value: statusCounts['in_progress'] || 0 },
    { name: t('projectPage.completed'), value: statusCounts['completed'] || 0 },
    { name: t('projectPage.cancelled'), value: statusCounts['cancelled'] || 0 },
  ].filter((d) => d.value > 0);

  const totalBudget = myProjects.reduce((sum, p) => sum + (p.budget || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('dashboardSales.title')}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          color="green"
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
