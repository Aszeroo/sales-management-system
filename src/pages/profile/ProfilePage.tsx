import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, Lock, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { salesService } from '@/services/sales.service';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import Swal from 'sweetalert2';
import type { Sales } from '@/types';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [salesData, setSalesData] = useState<Sales | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [user]);

  async function loadProfile() {
    if (!user) return;
    try {
      const data = await salesService.getByUserId(user.id);
      setSalesData(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">{t('profile.title')}</h1>

      {/* Profile Info */}
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
            {user?.user_metadata?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{user?.user_metadata?.full_name || user?.email}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Shield size={14} className="text-gray-400" />
              <span className="text-sm text-gray-500 capitalize">{user?.role}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {salesData && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <User size={16} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">{t('profile.salesCode')}</p>
                <p className="font-mono font-medium text-gray-900">{salesData.sales_code}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <User size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">{t('profile.username')}</p>
              <p className="font-medium text-gray-900">{salesData?.username || user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <User size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">{t('profile.email')}</p>
              <p className="font-medium text-gray-900">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Lock size={16} className="text-gray-400" />
            <div className="flex items-center gap-2">
              <div>
                <p className="text-xs text-gray-500">{t('profile.passwordStatus')}</p>
                <p className="text-sm text-gray-900">{t('profile.passwordChanged')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={() => setShowPasswordModal(true)}>
            <Lock size={16} />
            {t('profile.changePassword')}
          </Button>
        </div>
      </Card>

      {/* Password Modal */}
      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}

function ChangePasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const passwordSchema = z.object({
    newPassword: z.string().min(6, t('validation.passwordMinLength')),
    confirmPassword: z.string().min(1, t('validation.required')),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: t('validation.passwordsDoNotMatch'),
    path: ['confirmPassword'],
  });

  type PasswordFormData = z.infer<typeof passwordSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
      });

      if (error) throw error;

      Swal.fire(t('common.success'), t('profile.passwordChangedSuccess'), 'success');
      reset();
      onClose();
    } catch {
      Swal.fire(t('common.error'), '', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('profile.changePassword')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <TextInput
          label={t('common.newPassword') + ' *'}
          type="password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <TextInput
          label={t('common.confirmPassword') + ' *'}
          type="password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
