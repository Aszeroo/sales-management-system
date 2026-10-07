import { useTranslation } from 'react-i18next';
import { FolderKanban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMySalesId } from '@/components/shared/useMySalesId';
import { CrudListPage } from '@/components/shared/list';
import { ProjectCard } from '@/components/shared/cards';
import { projectCrudConfig } from '@/components/shared/crudConfigs';
import type { ProjectWithCustomer } from '@/types';

export default function ProjectListPage() {
  const { t } = useTranslation();
  const { isAdmin, isManager, isSales } = useAuth();
  // 3-role model (ADR-0001) — Permission Matrix (issue #5):
  //   create: admin/manager under any customer, sales under their own only
  //   edit:   admin/manager any, sales own-customer projects only
  //   delete: admin any, sales own-customer projects only, manager NEVER
  // The DB enforces the same cells via RLS (migration 0004); the UI hides
  // the buttons so the matrix is honored at both layers.
  const canCreateProjects = isAdmin || isManager || isSales;
  const mySalesId = useMySalesId();

  function isOwnCustomerProject(p: ProjectWithCustomer): boolean {
    return isSales && p.customer?.sales_id === mySalesId;
  }

  function canEditProject(p: ProjectWithCustomer): boolean {
    return isAdmin || isManager || isOwnCustomerProject(p);
  }

  function canDeleteProject(p: ProjectWithCustomer): boolean {
    // Manager never gets a delete button (Permission Matrix)
    return isAdmin || isOwnCustomerProject(p);
  }

  return (
    <CrudListPage<ProjectWithCustomer>
      {...projectCrudConfig(t)}
      title={t('projectPage.title')}
      createLabel={canCreateProjects ? t('projectPage.addProject') : undefined}
      emptyIcon={<FolderKanban size={48} />}
      renderCard={(p, actions) => (
        <ProjectCard
          project={p}
          viewHref={`/projects/${p.id}`}
          onEdit={canEditProject(p) ? actions.onEdit : undefined}
          onDelete={canDeleteProject(p) ? actions.onDelete : undefined}
        />
      )}
    />
  );
}
