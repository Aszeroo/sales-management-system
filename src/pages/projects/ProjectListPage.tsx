import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, Pencil, Trash2, Plus, FolderKanban } from 'lucide-react';
import { projectService } from '@/services/project.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import Swal from 'sweetalert2';
import type { ProjectWithCustomer } from '@/types';
import { ProjectFormModal } from './ProjectFormModal';

export default function ProjectListPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<ProjectWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithCustomer | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await projectService.getAll();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = projects.filter((p) => {
    const matchSearch =
      p.project_name.toLowerCase().includes(search.toLowerCase()) ||
      p.project_code.toLowerCase().includes(search.toLowerCase()) ||
      p.customer?.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleDelete(project: ProjectWithCustomer) {
    const result = await Swal.fire({
      title: t('common.confirmDeleteTitle'),
      text: t('common.confirmDelete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
    });

    if (result.isConfirmed) {
      try {
        await projectService.softDelete(project.id);
        setProjects(projects.filter((p) => p.id !== project.id));
        Swal.fire(t('common.success'), '', 'success');
      } catch {
        Swal.fire(t('common.error'), '', 'error');
      }
    }
  }

  function handleEdit(project: ProjectWithCustomer) {
    setEditingProject(project);
    setShowForm(true);
  }

  function handleCreate() {
    setEditingProject(null);
    setShowForm(true);
  }

  async function handleFormSuccess() {
    setShowForm(false);
    setEditingProject(null);
    await loadProjects();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('projectPage.title')}</h1>
        <Button onClick={handleCreate}>
          <Plus size={18} />
          {t('projectPage.addProject')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common.search')}
          className="w-full sm:w-80"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">{t('common.all')} {t('common.status')}</option>
          <option value="planning">{t('projectPage.planning')}</option>
          <option value="in_progress">{t('projectPage.inProgress')}</option>
          <option value="completed">{t('projectPage.completed')}</option>
          <option value="cancelled">{t('projectPage.cancelled')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={48} />}
          title={t('common.noData')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {p.project_code}
                </span>
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

              <div className="flex gap-2">
                <Link
                  to={`/projects/${p.id}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Eye size={14} />
                  {t('common.view')}
                </Link>
                <button
                  onClick={() => handleEdit(p)}
                  className="flex items-center justify-center px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="flex items-center justify-center px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ProjectFormModal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingProject(null);
          }}
          onSuccess={handleFormSuccess}
          project={editingProject}
        />
      )}
    </div>
  );
}
