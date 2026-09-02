import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, Trash2, Key, Users } from 'lucide-react';
import { salesService } from '@/services/sales.service';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatCurrency } from '@/lib/utils';
import Swal from 'sweetalert2';
import type { SalesWithCounts } from '@/types';

export default function AdminSalesPage() {
  const { t } = useTranslation();
  const [sales, setSales] = useState<SalesWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSales, setEditingSales] = useState<SalesWithCounts | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTarget, setResetTarget] = useState<SalesWithCounts | null>(null);

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    try {
      const data = await salesService.getAll();
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = sales.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.sales_code.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(s: SalesWithCounts) {
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
        await salesService.softDelete(s.id);
        setSales(sales.filter((item) => item.id !== s.id));
        Swal.fire(t('common.success'), '', 'success');
      } catch {
        Swal.fire(t('common.error'), '', 'error');
      }
    }
  }

  function handleEdit(s: SalesWithCounts) {
    setEditingSales(s);
    setShowForm(true);
  }

  function handleCreate() {
    setEditingSales(null);
    setShowForm(true);
  }

  function handleResetPassword(s: SalesWithCounts) {
    setResetTarget(s);
    setShowResetModal(true);
  }

  async function loadSalesData() {
    const data = await salesService.getAll();
    setSales(data);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('adminSales.title')}</h1>
        <Button onClick={handleCreate}>
          <Plus size={18} />
          {t('adminSales.addSales')}
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common.search')}
        className="w-full sm:w-80"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title={t('common.noData')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {s.sales_code}
                </span>
                <StatusBadge status={s.status} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">{s.full_name}</h3>
              <p className="text-sm text-gray-500 mb-3">{s.email}</p>

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex justify-between">
                  <span>{t('adminSales.username')}</span>
                  <span className="text-gray-900">{s.username}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.customers')}</span>
                  <span className="text-gray-900 font-medium">{s.customer_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.projects')}</span>
                  <span className="text-gray-900 font-medium">{s.project_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('salesPage.totalBudget')}</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(s.total_budget || 0)}</span>
                </div>
              </div>

              <div className="flex gap-1 flex-wrap">
                <Link
                  to={`/sales/${s.id}`}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Eye size={12} />
                  {t('common.view')}
                </Link>
                <button
                  onClick={() => handleEdit(s)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Pencil size={12} />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => handleResetPassword(s)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Key size={12} />
                  {t('salesPage.resetPassword')}
                </button>
                <button
                  onClick={() => handleDelete(s)}
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
        <SalesFormModal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingSales(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingSales(null);
            loadSalesData();
          }}
          sales={editingSales}
        />
      )}

      {showResetModal && resetTarget && (
        <ResetPasswordModal
          isOpen={showResetModal}
          onClose={() => {
            setShowResetModal(false);
            setResetTarget(null);
          }}
          target={resetTarget}
        />
      )}
    </div>
  );
}

function SalesFormModal({
  isOpen,
  onClose,
  onSuccess,
  sales,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sales: SalesWithCounts | null;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const salesSchema = z.object({
    sales_code: z.string().min(1, t('validation.required')),
    full_name: z.string().min(1, t('validation.required')),
    username: z.string().min(1, t('validation.required')),
    email: z.string().email(t('validation.invalidEmail')),
    password: sales ? z.string().optional() : z.string().min(6, t('validation.passwordMinLength')),
    status: z.enum(['active', 'inactive']),
  });

  type SalesFormData = z.infer<typeof salesSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      status: 'active',
    },
  });

  useEffect(() => {
    if (sales) {
      reset({
        sales_code: sales.sales_code,
        full_name: sales.full_name,
        username: sales.username,
        email: sales.email,
        status: sales.status,
      });
    } else {
      reset({
        sales_code: '',
        full_name: '',
        username: '',
        email: '',
        password: '',
        status: 'active',
      });
    }
  }, [sales, reset]);

  const onSubmit = async (data: SalesFormData) => {
    setLoading(true);
    try {
      if (sales) {
        // Update existing sales
        await salesService.update(sales.id, {
          sales_code: data.sales_code,
          full_name: data.full_name,
          username: data.username,
          email: data.email,
          status: data.status,
        });
      } else {
        // Create new sales user via Supabase auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password || 'tempPassword123',
          options: {
            data: {
              role: 'sales',
              full_name: data.full_name,
            },
          },
        });

        if (authError) throw authError;

        if (authData.user) {
          // Ensure profile exists (trigger should create it, but create as fallback)
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert(
              { id: authData.user.id, full_name: data.full_name },
              { onConflict: 'id', ignoreDuplicates: true }
            );
          if (profileError) {
            console.error('Profile creation fallback failed:', profileError);
          }

          // Create the sales record
          await salesService.create({
            user_id: authData.user.id,
            sales_code: data.sales_code,
            full_name: data.full_name,
            username: data.username,
            email: data.email,
            status: data.status,
          });
        }
      }
      Swal.fire(t('common.success'), '', 'success');
      onSuccess();
    } catch (err) {
      const msg = (err as Error).message || '';
      let detail = msg;
      if (msg.includes('rate limit')) {
        detail = 'Supabase email rate limit exceeded. Please disable email confirmation in Supabase Dashboard → Authentication → Providers → Email → Confirm email = OFF, then try again.';
      } else if (msg.includes('already been registered')) {
        detail = 'This email is already registered. Please use a different email.';
      }
      Swal.fire(t('common.error'), detail, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={sales ? t('adminSales.editSales') : t('adminSales.addSales')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label={t('adminSales.salesCode') + ' *'}
          {...register('sales_code')}
          error={errors.sales_code?.message}
          placeholder="S001"
        />
        <TextInput
          label={t('adminSales.fullName') + ' *'}
          {...register('full_name')}
          error={errors.full_name?.message}
        />
        <TextInput
          label={t('adminSales.username') + ' *'}
          {...register('username')}
          error={errors.username?.message}
        />
        <TextInput
          label={t('adminSales.email') + ' *'}
          type="email"
          {...register('email')}
          error={errors.email?.message}
        />
        {!sales && (
          <TextInput
            label={t('adminSales.password') + ' *'}
            type="password"
            {...register('password')}
            error={errors.password?.message}
          />
        )}
        <Select
          label={t('common.status')}
          {...register('status')}
          options={[
            { value: 'active', label: t('common.active') },
            { value: 'inactive', label: t('common.inactive') },
          ]}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {sales ? t('adminSales.updateSales') : t('adminSales.createSales')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  isOpen,
  onClose,
  target,
}: {
  isOpen: boolean;
  onClose: () => void;
  target: SalesWithCounts;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const resetSchema = z.object({
    newPassword: z.string().min(6, t('validation.passwordMinLength')),
  });

  type ResetFormData = z.infer<typeof resetSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    setLoading(true);
    try {
      // Use the database function to reset password (requires admin role)
      // Note: This requires the admin_reset_user_password function to be created in Supabase
      // See supabase/schema.sql for the function definition
      const { error } = await supabase.rpc('admin_reset_user_password', {
        target_user_id: target.user_id,
        new_password: data.newPassword,
      });

      if (error) {
        // Fallback: if the RPC function is not available, show a helpful message
        console.error('Password reset failed:', error);
        Swal.fire(
          t('common.error'),
          'Password reset requires the admin_reset_user_password database function. Please run the schema.sql file in your Supabase SQL editor.',
          'error'
        );
        return;
      }

      Swal.fire(t('common.success'), t('salesPage.passwordResetSuccess'), 'success');
      onClose();
    } catch {
      Swal.fire(t('common.error'), '', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('salesPage.resetPassword')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('salesPage.resetPassword')} for {target.full_name}
        </p>
        <TextInput
          label={t('salesPage.newPassword') + ' *'}
          type="password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading} variant="danger">
            {t('salesPage.resetPassword')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
