import { useTranslation } from 'react-i18next';
import { FolderKanban } from 'lucide-react';
import { CrudListPage } from '@/components/shared/list';
import { ProjectCard } from '@/components/shared/cards';
import { projectCrudConfig } from '@/components/shared/crudConfigs';
import type { ProjectWithCustomer } from '@/types';

export default function AdminProjectPage() {
  const { t } = useTranslation();

  return (
    <CrudListPage<ProjectWithCustomer>
      {...projectCrudConfig(t)}
      title={t('adminProject.title')}
      createLabel={t('adminProject.addProject')}
      emptyIcon={<FolderKanban size={48} />}
      renderCard={(p, actions) => (
        <ProjectCard
          project={p}
          viewHref={`/projects/${p.id}`}
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
          compact
        />
      )}
    />
  );
}
