/**
 * The one status vocabulary (issue #8). Every place that renders, filters, or
 * validates a status — badges, list filter selects, form selects, chart
 * labels — reads it from this map, so there is no second copy of "what
 * statuses exist" or "what a status looks like".
 */
export const CUSTOMER_STATUSES = ['active', 'inactive'] as const;
export const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'cancelled'] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type StatusKey = CustomerStatus | ProjectStatus;

/**
 * The "live" Customer status — the one value services filter on when they
 * mean "not parked" (issue #23): even single status strings come from this
 * module, so there is no second copy of the vocabulary in a query.
 */
export const CUSTOMER_STATUS_ACTIVE: CustomerStatus = 'active';

/** i18n key per status — both locale files already ship every key. */
export const STATUS_I18N_KEYS: Record<StatusKey, string> = {
  active: 'common.active',
  inactive: 'common.inactive',
  planning: 'projectPage.planning',
  in_progress: 'projectPage.inProgress',
  completed: 'projectPage.completed',
  cancelled: 'projectPage.cancelled',
};

/** Badge palette per status (see ui/StatusBadge). */
const STATUS_BADGE_CLASSES: Record<StatusKey, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-red-50 text-red-700 border-red-200',
  planning: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
};

/**
 * Fixed English badge labels. The badge has always rendered these regardless
 * of locale (the localized names appear in selects and charts); kept verbatim
 * so the refactor stays behavior-identical.
 */
const STATUS_BADGE_LABELS: Record<StatusKey, string> = {
  active: 'Active',
  inactive: 'Inactive',
  planning: 'Planning',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status as StatusKey] || 'bg-gray-50 text-gray-700 border-gray-200';
}

export function statusBadgeLabel(status: string): string {
  return STATUS_BADGE_LABELS[status as StatusKey] || status;
}

/**
 * <option> list for the status filter select: the "all statuses" entry first,
 * then every status of the given vocabulary, labeled through i18n.
 */
export function statusFilterOptions<K extends StatusKey>(
  statuses: readonly K[],
  t: (key: string) => string,
): { value: string; label: string }[] {
  return [
    { value: 'all', label: `${t('common.all')} ${t('common.status')}` },
    ...statuses.map((s) => ({ value: s, label: t(STATUS_I18N_KEYS[s]) })),
  ];
}

/** <option> list for form selects — every status, no "all" entry. */
export function statusFormOptions<K extends StatusKey>(
  statuses: readonly K[],
  t: (key: string) => string,
): { value: K; label: string }[] {
  return statuses.map((s) => ({ value: s, label: t(STATUS_I18N_KEYS[s]) }));
}
