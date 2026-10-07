import { statusBadgeClass, statusBadgeLabel } from '@/lib/status';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

/** Renders any row status through the shared status map (issue #8). */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(status)} ${className}`}
    >
      {statusBadgeLabel(status)}
    </span>
  );
}
