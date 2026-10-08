import { useTranslation } from 'react-i18next';
import { FolderKanban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMySalesId } from '@/components/shared/useMySalesId';
import { CrudListPage } from '@/components/shared/list';
import { ProjectCard } from '@/components/shared/cards';
import { projectCrudConfig } from '@/components/shared/crudConfigs';
import {
  canCreateProjects,
  canDeleteProjects,
  canEditProjects,
} from '@/lib/permissions';
import type { ProjectWithCustomer } from '@/types';

export default function ProjectListPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;
  // 3-role model (ADR-0001) — Permission Matrix (issue #5), cells decided in
  // lib/permissions (#22):
  //   create: admin/manager under any customer, sales under their own only
  //   edit:   admin/manager any, sales own-customer projects only
  //   delete: admin any, sales own-customer projects only, manager NEVER
  // The DB enforces the same cells via RLS (migration 0004); the UI hides
  // the buttons so the matrix is honored at both layers.
  const mySalesId = useMySalesId();

  return (
    <CrudListPage<ProjectWithCustomer>
      {...projectCrudConfig(t)}
      title={t('projectPage.title')}
      createLabel={canCreateProjects(role) ? t('projectPage.addProject') : undefined}
      emptyIcon={<FolderKanban size={48} />}
      renderCard={(p, actions) => {
        const isOwnCustomer = p.customer?.sales_id === mySalesId;
        return (
          <ProjectCard
            project={p}
            viewHref={`/projects/${p.id}`}
            onEdit={canEditProjects(role, isOwnCustomer) ? actions.onEdit : undefined}
            onDelete={canDeleteProjects(role, isOwnCustomer) ? actions.onDelete : undefined}
          />
        );
      }}
    />
  );
}
