import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, BriefcaseBusiness } from 'lucide-react';
import { customerService } from '@/services/customer.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import Swal from 'sweetalert2';
import type { CustomerWithCounts } from '@/types';
import { CustomerFormModal } from '@/pages/customers/CustomerFormModal';

export default function AdminCustomerPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState<CustomerWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithCounts | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const data = await customerService.getAll();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = customers.filter((c) => {
    const matchSearch =
      c.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
      c.company_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleDelete(customer: CustomerWithCounts) {
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
        await customerService.softDelete(customer.id);
        setCustomers(customers.filter((c) => c.id !== customer.id));
        Swal.fire(t('common.success'), '', 'success');
      } catch {
        Swal.fire(t('common.error'), '', 'error');
      }
    }
  }

  function handleEdit(customer: CustomerWithCounts) {
    setEditingCustomer(customer);
    setShowForm(true);
  }

  function handleCreate() {
    setEditingCustomer(null);
    setShowForm(true);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('adminCustomer.title')}</h1>
        <Button onClick={handleCreate}>
          <Plus size={18} />
          {t('adminCustomer.addCustomer')}
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
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<BriefcaseBusiness size={48} />} title={t('common.noData')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {c.customer_code}
                </span>
                <StatusBadge status={c.status} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">{c.customer_name}</h3>
              <p className="text-sm text-gray-500 mb-3">{c.company_name}</p>

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>{t('customerPage.contactPerson')}</span>
                  <span className="text-gray-900">{c.contact_person || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.projects')}</span>
                  <span className="text-gray-900 font-medium">{c.project_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesDetail.totalBudget')}</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(c.total_budget || 0)}</span>
                </div>
                {c.sales && (
                  <div className="flex justify-between">
                    <span>{t('common.assignedTo')}</span>
                    <span className="text-gray-900">{(c.sales as { full_name?: string })?.full_name || '-'}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-1 flex-wrap">
                <Link
                  to={`/customers/${c.id}`}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Eye size={12} />
                  {t('common.view')}
                </Link>
                <button
                  onClick={() => handleEdit(c)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Pencil size={12} />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Trash2 size={12} />
                  {t('common.delete')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <CustomerFormModal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingCustomer(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingCustomer(null);
            loadCustomers();
          }}
          customer={editingCustomer}
        />
      )}
    </div>
  );
}
