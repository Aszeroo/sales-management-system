import { useTranslation } from 'react-i18next';
import { FolderKanban } from 'lucide-react';
import { projectService } from '@/services/project.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PROJECT_STATUSES, statusFilterOptions } from '@/lib/status';
import { CrudListPage, CodeChip, ItemActionRow } from '@/components/shared/list';
import type { ProjectWithCustomer } from '@/types';
import { ProjectFormModal } from '@/pages/projects/ProjectFormModal';

export default function AdminProjectPage() {
  const { t } = useTranslation();

  return (
    <CrudListPage<ProjectWithCustomer>
      title={t('adminProject.title')}
      createLabel={t('adminProject.addProject')}
      emptyIcon={<FolderKanban size={48} />}
      load={() => projectService.getAll()}
      getId={(p) => p.id}
      matchesSearch={(p, q) =>
        p.project_name.toLowerCase().includes(q) ||
        p.project_code.toLowerCase().includes(q) ||
        (p.customer?.customer_name?.toLowerCase().includes(q) ?? false)
      }
      statusOptions={statusFilterOptions(PROJECT_STATUSES, t)}
      statusOf={(p) => p.status}
      deleteItem={(p) => projectService.softDelete(p.id)}
      renderForm={(editing, close, onSaved) => (
        <ProjectFormModal isOpen onClose={close} onSuccess={onSaved} project={editing} />
      )}
      renderCard={(p, actions) => (
        <Card className="hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <CodeChip code={p.project_code} />
            <StatusBadge status={p.status} />
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-1">{p.project_name}</h3>
          <p className="text-sm text-gray-500 mb-3">{p.customer?.customer_name || '-'}</p>

          <div className="space-y-2 text-sm text-gray-600 mb-4">
            <div className="flex justify-between">
              <span>{t('projectPage.budget')}</span>
              <span className="text-gray-900 font-medium">{formatCurrency(p.budget)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('projectPage.startDate')}</span>
              <span className="text-gray-900">{formatDate(p.start_date)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('projectPage.endDate')}</span>
              <span className="text-gray-900">{formatDate(p.end_date)}</span>
            </div>
          </div>

          <ItemActionRow viewHref={`/projects/${p.id}`} onEdit={actions.onEdit} onDelete={actions.onDelete} compact />
        </Card>
      )}
    />
  );
}
