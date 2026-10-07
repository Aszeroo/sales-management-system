import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, KeyRound, UserCog, Ban, RotateCcw } from 'lucide-react';
import { userService } from '@/services/user.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { TextInput } from '@/components/ui/TextInput';
import { Select } from '@/components/ui/Select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Swal from 'sweetalert2';
import { isAdminRole } from '@/lib/roles';
import { USER_ROLES } from '@/types';
import type { ManagedUser } from '@/types';
import { CardGrid, ListPageHeader, ListToolbar } from '@/components/shared/list';
import { useCrudList } from '@/components/shared/useCrudList';

/**
 * Unified users page for Admin (issue #7, ADR-0001): every User of every
 * role in one list, and every account operation through the admin
 * SECURITY DEFINER RPCs — create with any role, reset password, change
 * role, real deactivate/reactivate. The old per-sales management page is
 * fully replaced by this page.
 *
 * The list logic (load/search/modal wiring) comes from the shared CRUD
 * module; the account operations and their two extra modals stay here
 * because they are unique to this page.
 */

const ROLES = USER_ROLES;

/** Maps RPC error text to i18n; keeps the owned-count from the guard. */
function describeRpcError(message: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (message.includes('already registered')) return t('adminUsers.errorEmailTaken');
  if (message.includes('at least 6 characters')) return t('adminUsers.errorPasswordShort');
  if (message.includes('Invalid role')) return t('adminUsers.errorInvalidRole');
  if (message.includes('still owns')) {
    const m = message.match(/(\d+)/);
    return t('adminUsers.ownerBlocked', { count: m ? Number(m[1]) : '—' });
  }
  return message;
}

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [roleTarget, setRoleTarget] = useState<ManagedUser | null>(null);

  const list = useCrudList<ManagedUser>({
    load: () => userService.getAll(),
    getId: (u) => u.user_id,
    matchesSearch: (u, q) =>
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.sales_code || '').toLowerCase().includes(q),
    renderForm: (_editing, close, onSaved) => <CreateUserModal onClose={close} onSuccess={onSaved} />,
    onLoadError: (err) => {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    },
  });

  async function handleDeactivate(u: ManagedUser) {
    // Advance warning BEFORE attempting (ADR-0001): a Sales Owner cannot
    // leave their customers ownerless — the RPC rejects with the same count.
    let owned = 0;
    try {
      owned = await userService.getPendingReassignmentCount(u.user_id);
    } catch {
      owned = 0;
    }
    if (owned > 0) {
      Swal.fire(t('adminUsers.ownerWarningTitle'), t('adminUsers.ownerWarning', { count: owned }), 'warning');
      return;
    }

    const result = await Swal.fire({
      title: t('adminUsers.deactivateTitle'),
      text: t('adminUsers.deactivateWarning', { name: u.full_name }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('adminUsers.deactivate'),
      cancelButtonText: t('common.cancel'),
    });
    if (!result.isConfirmed) return;

    try {
      await userService.setActive(u.user_id, false);
      Swal.fire(t('common.success'), t('adminUsers.deactivated'), 'success');
      void list.reload();
    } catch (err) {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    }
  }

  async function handleReactivate(u: ManagedUser) {
    const result = await Swal.fire({
      title: t('adminUsers.reactivateTitle'),
      text: t('adminUsers.reactivateWarning', { name: u.full_name }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('adminUsers.reactivate'),
      cancelButtonText: t('common.cancel'),
    });
    if (!result.isConfirmed) return;

    try {
      await userService.setActive(u.user_id, true);
      Swal.fire(t('common.success'), t('adminUsers.reactivated'), 'success');
      void list.reload();
    } catch (err) {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    }
  }

  if (list.loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <ListPageHeader title={t('adminUsers.title')} createLabel={t('adminUsers.addUser')} onCreate={list.openCreate} />
      <ListToolbar search={list.search} onSearchChange={list.setSearch} />

      {list.filtered.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title={t('common.noData')} />
      ) : (
        <CardGrid>
          {list.filtered.map((u) => (
            <Card key={u.user_id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {t(`role.${u.role}`)}
                </span>
                <StatusBadge status={u.is_active ? 'active' : 'inactive'} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">{u.full_name}</h3>
              <p className="text-sm text-gray-500 mb-1 break-all">{u.email}</p>
              <p className="text-xs text-gray-400 mb-3 font-mono">
                {u.sales_code ? `SL: ${u.sales_code}` : t('adminUsers.noSalesRow')}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setResetTarget(u)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <KeyRound size={12} />
                  {t('common.resetPassword')}
                </button>
                <button
                  onClick={() => setRoleTarget(u)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <UserCog size={12} />
                  {t('adminUsers.changeRole')}
                </button>
                {u.is_active ? (
                  <button
                    onClick={() => handleDeactivate(u)}
                    className="col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Ban size={12} />
                    {t('adminUsers.deactivate')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleReactivate(u)}
                    className="col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    <RotateCcw size={12} />
                    {t('adminUsers.reactivate')}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </CardGrid>
      )}

      {list.formModal}

      {resetTarget && <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />}

      {roleTarget && (
        <ChangeRoleModal
          target={roleTarget}
          onClose={() => setRoleTarget(null)}
          onSuccess={() => {
            setRoleTarget(null);
            void list.reload();
          }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const createSchema = z.object({
    full_name: z.string().min(1, t('validation.required')),
    email: z.string().email(t('validation.invalidEmail')),
    password: z.string().min(6, t('validation.passwordMinLength')),
    role: z.enum(USER_ROLES),
  });
  type CreateFormData = z.infer<typeof createSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'sales' },
  });

  const onSubmit = async (data: CreateFormData) => {
    setLoading(true);
    try {
      await userService.create({
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        role: data.role,
      });
      Swal.fire(t('common.success'), t('adminUsers.userCreated'), 'success');
      onSuccess();
    } catch (err) {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('adminUsers.addUser')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label={t('adminUsers.fullName') + ' *'}
          {...register('full_name')}
          error={errors.full_name?.message}
        />
        <TextInput
          label={t('common.email') + ' *'}
          type="email"
          {...register('email')}
          error={errors.email?.message}
        />
        <TextInput
          label={t('common.password') + ' *'}
          type="password"
          {...register('password')}
          error={errors.password?.message}
        />
        <Select
          label={t('adminUsers.role') + ' *'}
          options={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
          {...register('role')}
          error={errors.role?.message}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {t('adminUsers.createUser')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ target, onClose }: { target: ManagedUser; onClose: () => void }) {
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
  } = useForm<ResetFormData>({ resolver: zodResolver(resetSchema) });

  const onSubmit = async (data: ResetFormData) => {
    setLoading(true);
    try {
      await userService.resetPassword(target.user_id, data.newPassword);
      Swal.fire(t('common.success'), t('adminUsers.passwordResetDone'), 'success');
      onClose();
    } catch (err) {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('common.resetPassword')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('adminUsers.resetPasswordFor', { name: target.full_name })}
        </p>
        <TextInput
          label={t('common.newPassword') + ' *'}
          type="password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading} variant="danger">
            {t('common.resetPassword')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeRoleModal({
  target,
  onClose,
  onSuccess,
}: {
  target: ManagedUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const roleSchema = z.object({
    role: z.enum(USER_ROLES),
  });
  type RoleFormData = z.infer<typeof roleSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: target.role },
  });

  const onSubmit = async (data: RoleFormData) => {
    if (data.role === target.role) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      // Advance warning BEFORE attempting (ADR-0001): promoting a Sales
      // Owner to admin would leave their customers ownerless — the RPC
      // rejects with the same count if the operator proceeds anyway.
      if (isAdminRole(data.role) && !isAdminRole(target.role)) {
        const owned = await userService.getPendingReassignmentCount(target.user_id);
        if (owned > 0) {
          setLoading(false);
          Swal.fire(t('adminUsers.ownerWarningTitle'), t('adminUsers.ownerWarning', { count: owned }), 'warning');
          return;
        }
      }

      const result = await Swal.fire({
        title: t('adminUsers.changeRoleTitle'),
        text: t('adminUsers.changeRoleWarning', {
          name: target.full_name,
          role: t(`role.${data.role}`),
        }),
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      });
      if (!result.isConfirmed) {
        setLoading(false);
        return;
      }

      await userService.changeRole(target.user_id, data.role);
      Swal.fire(t('common.success'), t('adminUsers.roleChanged'), 'success');
      onSuccess();
    } catch (err) {
      Swal.fire(t('common.error'), describeRpcError((err as Error).message, t), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('adminUsers.changeRole')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-gray-600">
          {t('adminUsers.changeRoleFor', { name: target.full_name, role: t(`role.${target.role}`) })}
        </p>
        <Select
          label={t('adminUsers.role') + ' *'}
          options={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
          {...register('role')}
          error={errors.role?.message}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {t('adminUsers.updateRole')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
