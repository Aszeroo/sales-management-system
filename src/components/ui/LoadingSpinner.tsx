import { useTranslation } from 'react-i18next';

export function LoadingSpinner({ message }: { message?: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
      <p className="text-sm text-gray-500">{message || t('common.loading')}</p>
    </div>
  );
}

export function FullPageLoader() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      </div>
    </div>
  );
}
