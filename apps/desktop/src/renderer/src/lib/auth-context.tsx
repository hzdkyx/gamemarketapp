import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getDesktopApi } from "./desktop-api";
import type {
  AuthChangePasswordInput,
  AuthLoginInput,
  AuthSession,
  AuthSetupAdminInput
} from "../../../shared/contracts";

interface AuthContextValue {
  loading: boolean;
  hasAdmin: boolean;
  session: AuthSession | null;
  refresh: () => Promise<void>;
  setupAdmin: (input: AuthSetupAdminInput) => Promise<void>;
  login: (input: AuthLoginInput) => Promise<void>;
  logout: () => Promise<void>;
  changeOwnPassword: (input: AuthChangePasswordInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [loading, setLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const bootstrap = await api.auth.getBootstrap();
      setHasAdmin(bootstrap.hasAdmin);
      setSession(bootstrap.session);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  const setupAdmin = useCallback(
    async (input: AuthSetupAdminInput): Promise<void> => {
      await api.auth.setupAdmin(input);
      setHasAdmin(true);
      setSession(null);
    },
    [api]
  );

  const login = useCallback(
    async (input: AuthLoginInput): Promise<void> => {
      setSession(await api.auth.login(input));
      setHasAdmin(true);
    },
    [api]
  );

  const logout = useCallback(async (): Promise<void> => {
    await api.auth.logout();
    setSession(null);
  }, [api]);

  const changeOwnPassword = useCallback(
    async (input: AuthChangePasswordInput): Promise<void> => {
      setSession(await api.auth.changeOwnPassword(input));
    },
    [api]
  );

  const value = useMemo(
    () => ({
      loading,
      hasAdmin,
      session,
      refresh,
      setupAdmin,
      login,
      logout,
      changeOwnPassword
    }),
    [changeOwnPassword, hasAdmin, loading, login, logout, refresh, session, setupAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("AuthProvider não encontrado.");
  }
  return value;
};
