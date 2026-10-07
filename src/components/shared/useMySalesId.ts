import { useEffect, useState } from 'react';
import { salesService } from '@/services/sales.service';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The signed-in owner-capable user's sales row id (ADR-0001) — the anchor
 * for the list pages' own-row permission gates. Admin has no sales row.
 */
export function useMySalesId(): string | null {
  const { isAdmin, user } = useAuth();
  const [mySalesId, setMySalesId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && user?.id) {
      salesService.getByUserId(user.id).then((s) => {
        if (s) setMySalesId(s.id);
      });
    }
  }, [isAdmin, user]);

  return mySalesId;
}
