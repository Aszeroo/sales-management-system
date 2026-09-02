import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, DollarSign, User } from 'lucide-react';
import { projectService } from '@/services/project.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { ProjectWithCustomer } from '@/types';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithCustomer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  async function loadData(projectId: string) {
    try {
      const data = await projectService.getById(projectId);
      setProject(data);
    } catch (err) {
      console.error('Failed to load project detail:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (!project) return <EmptyState title={t('common.noData')} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{project.project_name}</h1>
        <StatusBadge status={project.status} />
      </div>

      {/* Project Info */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('projectDetail.projectInfo')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">{t('projectPage.projectCode')}</p>
            <p className="font-mono font-medium text-gray-900">{project.project_code}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('projectPage.projectName')}</p>
            <p className="font-medium text-gray-900">{project.project_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('projectPage.customer')}</p>
            <p className="font-medium text-gray-900">{project.customer?.customer_name || t('projectDetail.noCustomer')}</p>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign size={14} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">{t('projectPage.budget')}</p>
              <p className="font-medium text-gray-900 text-lg">{formatCurrency(project.budget)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">{t('projectPage.startDate')}</p>
              <p className="font-medium text-gray-900">{formatDate(project.start_date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">{t('projectPage.endDate')}</p>
              <p className="font-medium text-gray-900">{formatDate(project.end_date)}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('common.status')}</p>
            <StatusBadge status={project.status} />
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('common.createdAt')}</p>
            <p className="text-gray-900">{formatDateTime(project.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('common.updatedAt')}</p>
            <p className="text-gray-900">{formatDateTime(project.updated_at)}</p>
          </div>
        </div>
        {project.description && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-1">{t('common.description')}</p>
            <p className="text-gray-900">{project.description}</p>
          </div>
        )}
      </Card>

      {/* Customer Info */}
      {project.customer && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('common.customer')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">{t('customerPage.customerCode')}</p>
              <p className="font-mono font-medium text-gray-900">{project.customer.customer_code}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('customerPage.customerName')}</p>
              <p className="font-medium text-gray-900">{project.customer.customer_name}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
