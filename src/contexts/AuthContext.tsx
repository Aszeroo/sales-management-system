import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuthUser, UserRole } from '@/types';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSales: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const buildUser = useCallback((authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) => {
    const role = (authUser.user_metadata?.role as UserRole) || 'sales';
    return {
      id: authUser.id,
      email: authUser.email || '',
      role,
      user_metadata: {
        role,
        full_name: (authUser.user_metadata?.full_name as string) || '',
      },
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(buildUser(session.user));
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(buildUser(session.user));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [buildUser]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Return user-friendly error messages
        const msg = error.message;
        if (msg.includes('Invalid login credentials')) {
          return { error: 'login.errorInvalidCredentials' };
        }
        if (msg.includes('Email not confirmed')) {
          return { error: 'login.errorEmailNotConfirmed' };
        }
        return { error: msg };
      }
      return {};
    } catch {
      return { error: 'login.errorUnexpected' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // === Auto-logout on inactivity ===
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      supabase.auth.signOut();
      setUser(null);
      window.location.href = '/login';
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!user) {
      // No user logged in — clear timer
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // User is logged in — start tracking activity
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Start the initial timer
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, resetTimer]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        isAdmin: user?.role === 'admin',
        isSales: user?.role === 'sales',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
