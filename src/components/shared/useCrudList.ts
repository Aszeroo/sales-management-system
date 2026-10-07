import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Swal from 'sweetalert2';

export interface CrudStatusOption {
  value: string;
  label: string;
}

/**
 * One list/CRUD page's state and logic (issue #8): loading, search and
 * status filtering, create/edit modal wiring, and the confirm-then-soft-
 * delete flow (SweetAlert). Every list page consumes this hook — none of
 * them re-implements load/filter/confirm logic.
 *
 * The config is read through a ref so pages can pass inline closures; the
 * list loads once on mount, exactly as the pages did before.
 */
export interface CrudListConfig<T> {
  /** Loads the rows — RLS decides what the signed-in role sees. */
  load: () => Promise<T[]>;
  getId: (item: T) => string;
  /** Search predicate against one row; `query` arrives lowercased. */
  matchesSearch: (item: T, query: string) => boolean;
  /**
   * <option> list for the status filter (built from lib/status); omit when
   * the list has no status filter.
   */
  statusOptions?: CrudStatusOption[];
  /** Reads the row's status for filtering; required when statusOptions is set. */
  statusOf?: (item: T) => string;
  /** Soft-deletes one row through the service seam; omit when the page cannot delete. */
  deleteItem?: (item: T) => Promise<void>;
  /** Renders the page's form modal — create when `editing` is null. */
  renderForm?: (editing: T | null, close: () => void, onSaved: () => void) => ReactNode;
  /** Extra handling on top of the console log when loading fails. */
  onLoadError?: (error: unknown) => void;
}

export function useCrudList<T>(config: CrudListConfig<T>) {
  const { t } = useTranslation();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);

  // Latest config without re-triggering the mount-only load effect.
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    configRef.current
      .load()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        console.error('Failed to load list:', err);
        configRef.current.onLoadError?.(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- load-once-on-mount, like every list page
  }, []);

  async function reload() {
    try {
      setItems(await configRef.current.load());
    } catch (err) {
      console.error('Failed to load list:', err);
      configRef.current.onLoadError?.(err);
    } finally {
      setLoading(false);
    }
  }

  const cfg = configRef.current;
  const filtered = items.filter((item) => {
    const matchSearch = cfg.matchesSearch(item, search.toLowerCase());
    const matchStatus =
      !cfg.statusOf || statusFilter === 'all' || cfg.statusOf(item) === statusFilter;
    return matchSearch && matchStatus;
  });

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(item: T) {
    setEditing(item);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function confirmDelete(item: T) {
    const result = await Swal.fire({
      title: t('common.confirmDeleteTitle'),
      text: t('common.confirmDelete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
    });

    if (!result.isConfirmed) return;

    try {
      await configRef.current.deleteItem?.(item);
      const deletedId = configRef.current.getId(item);
      setItems((prev) => prev.filter((x) => configRef.current.getId(x) !== deletedId));
      Swal.fire(t('common.success'), '', 'success');
    } catch {
      Swal.fire(t('common.error'), '', 'error');
    }
  }

  const formModal =
    showForm && cfg.renderForm
      ? cfg.renderForm(editing, closeForm, () => {
          closeForm();
          void reload();
        })
      : null;

  return {
    items,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    filtered,
    showForm,
    editing,
    openCreate,
    openEdit,
    closeForm,
    confirmDelete,
    reload,
    formModal,
  };
}
