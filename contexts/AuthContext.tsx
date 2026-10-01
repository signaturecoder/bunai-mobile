import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUser, getToken, clearAuth } from '@/lib/auth';
import { ensureRefreshed } from '@/lib/api';
import { onAuthExpired } from '@/lib/authEvents';
import { AppState } from 'react-native';
import type { User } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isRefreshing: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sessionExpired: boolean;
  acknowledgeSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const refreshUser = async () => {
    try {
      const token = await getToken();
      if (token) {
        const storedUser = await getUser();
        setUser(storedUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      setUser(null);
    }
  };

  const logout = async () => {
    await clearAuth();
    setUser(null);
  };

  const acknowledgeSessionExpired = () => setSessionExpired(false);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      await refreshUser();
      if (mounted) setIsLoading(false);
    };
    init();

    // Refresh when app comes to foreground
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        try {
          setIsRefreshing(true);
          await ensureRefreshed();
          await refreshUser();
        } finally {
          setIsRefreshing(false);
        }
      }
    });

    return () => {
      mounted = false;
      // subscription may provide remove()
      try {
        (sub as any)?.remove?.();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // subscribe to global auth-expired events so we can show modal-ish UI if needed
  useEffect(() => {
    const unsubAuth = onAuthExpired(async () => {
      // ensure local state cleared and mark session expired for UI
      setUser(null);
      setSessionExpired(true);
      try {
        await clearAuth();
      } catch (e) {}
    });
    return () => unsubAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        logout,
        refreshUser,
        // expose refreshing status so UI can show reconnecting indicator
        isRefreshing,
        sessionExpired,
        acknowledgeSessionExpired,
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
