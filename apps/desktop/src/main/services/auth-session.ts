import type { AuthSession, PermissionKey, UserRecord } from "../../shared/contracts";
import { getPermissionsForUser } from "./auth-permissions";

let currentSession: AuthSession | null = null;

export const createSession = (user: UserRecord): AuthSession => {
  currentSession = {
    user,
    permissions: getPermissionsForUser(user)
  };

  return currentSession;
};

export const clearSession = (): void => {
  currentSession = null;
};

export const getCurrentSession = (): AuthSession | null => currentSession;

export const updateCurrentSession = (user: UserRecord): void => {
  if (currentSession?.user.id === user.id) {
    createSession(user);
  }
};

export const requireSession = (): AuthSession => {
  if (!currentSession || currentSession.user.status !== "active") {
    throw new Error("Acesso negado. Faça login novamente.");
  }

  return currentSession;
};

export const requirePermission = (permission: PermissionKey): AuthSession => {
  const session = requireSession();

  if (!session.permissions[permission]) {
    throw new Error("Acesso negado.");
  }

  return session;
};
