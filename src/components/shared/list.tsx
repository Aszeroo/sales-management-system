import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { useCrudList } from '@/components/shared/useCrudList';
import type { CrudListConfig } from '@/components/shared/useCrudList';

/**
 * The shared list-page layer (issue #8): the header/toolbar/grid shell and
 * the action buttons every list card shows. Pages keep only what is theirs —
 * title, card fields, per-row permission gates — as configuration; the load/
 * filter/confirm/modal logic lives in useCrudList, not in any page.
 */

/** The blue mono code chip every list card leads with. */
export function CodeChip({ code }: { code: string }) {
  return (
    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded">
      {code}
    </span>
  );
}

/** Page header row: title left, create button (or one extra slot) right. */
export function ListPageHeader({
  title,
  createLabel,
  onCreate,
  headerExtra,
}: {
  title: string;
  createLabel?: string;
  onCreate?: () => void;
  headerExtra?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {createLabel ? (
        <Button onClick={onCreate}>
          <Plus size={18} />
          {createLabel}
        </Button>
      ) : (
        headerExtra
      )}
    </div>
  );
}

/** Toolbar row under the header: search plus, optionally, the status filter. */
export function ListToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  statusOptions?: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const hasStatus = statusOptions && statusFilter !== undefined && onStatusFilterChange;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={t('common.search')}
        className="w-full sm:w-80"
      />
      {hasStatus && (
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** The 3-column card grid every list page renders its cards in. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}

/**
 * View/Edit/Delete row for a list card. `compact` is the admin pages'
 * smaller labeled variant; pass no handler to hide that button (the page's
 * permission gates decide).
 */
/** One action row's sizing/spacing variant: the admin pages' compact labeled row vs the card row. */
const ACTION_ROW_VARIANTS = {
  compact: {
    row: 'flex gap-1 flex-wrap',
    iconSize: 12,
    showLabel: true,
    view: 'flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-medium transition-colors',
    edit: 'flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors',
    remove: 'flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-medium transition-colors',
  },
  regular: {
    row: 'flex gap-2',
    iconSize: 14,
    showLabel: false,
    view: 'flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors',
    edit: 'flex items-center justify-center px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors',
    remove: 'flex items-center justify-center px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors',
  },
} as const;

function ActionButton({
  onClick,
  className,
  icon: Icon,
  label,
  showLabel,
  iconSize,
}: {
  onClick: () => void;
  className: string;
  icon: typeof Pencil;
  label: string;
  showLabel: boolean;
  iconSize: number;
}) {
  return (
    <button onClick={onClick} className={className}>
      <Icon size={iconSize} />
      {showLabel && label}
    </button>
  );
}

export function ItemActionRow({
  viewHref,
  onEdit,
  onDelete,
  compact = false,
}: {
  viewHref: string;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const variant = ACTION_ROW_VARIANTS[compact ? 'compact' : 'regular'];

  return (
    <div className={variant.row}>
      <Link to={viewHref} className={variant.view}>
        <Eye size={variant.iconSize} />
        {t('common.view')}
      </Link>
      {onEdit && (
        <ActionButton
          onClick={onEdit}
          className={variant.edit}
          icon={Pencil}
          label={t('common.edit')}
          showLabel={variant.showLabel}
          iconSize={variant.iconSize}
        />
      )}
      {onDelete && (
        <ActionButton
          onClick={onDelete}
          className={variant.remove}
          icon={Trash2}
          label={t('common.delete')}
          showLabel={variant.showLabel}
          iconSize={variant.iconSize}
        />
      )}
    </div>
  );
}


/** Wiring handed to a page's card renderer by CrudListPage. */
export interface CrudItemActions {
  onEdit: () => void;
  onDelete: () => void;
}

export interface CrudListPageProps<T> extends CrudListConfig<T> {
  title: string;
  /** Label for the header's create button; omit when the page cannot create. */
  createLabel?: string;
  emptyIcon: ReactNode;
  /** Renders one card; `actions` carry the shared edit/delete wiring. */
  renderCard: (item: T, actions: CrudItemActions) => ReactNode;
}

/**
 * The whole list-page shell: header, search/status toolbar, loading and
 * empty states, the card grid, and the page's form modal. Behavior is the
 * one the five duplicated pages used to implement by hand.
 */
export function CrudListPage<T>({
  title,
  createLabel,
  emptyIcon,
  renderCard,
  ...config
}: CrudListPageProps<T>) {
  const { t } = useTranslation();
  const list = useCrudList(config);

  if (list.loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <ListPageHeader title={title} createLabel={createLabel} onCreate={list.openCreate} />
      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        statusFilter={list.statusFilter}
        onStatusFilterChange={list.setStatusFilter}
        statusOptions={config.statusOptions}
      />

      {list.filtered.length === 0 ? (
        <EmptyState icon={emptyIcon} title={t('common.noData')} />
      ) : (
        <CardGrid>
          {list.filtered.map((item) => (
            <Fragment key={config.getId(item)}>
              {renderCard(item, {
                onEdit: () => list.openEdit(item),
                onDelete: () => list.confirmDelete(item),
              })}
            </Fragment>
          ))}
        </CardGrid>
      )}

      {list.formModal}
    </div>
  );
}
