import { useEffect, useState } from 'react';

/**
 * One detail page's data state (issue #8): fetch by route id on mount and
 * on id change, log failures, and flip loading off once settled — the
 * boilerplate every detail page used to hand-write.
 */
export function useDetailView<T>(
  id: string | undefined,
  fetch: (id: string) => Promise<T>,
): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(id)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((err) => {
        console.error('Failed to load detail:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fetch is fixed per page; reload on id change only
  }, [id]);

  return { data, loading };
}
