import type {
  AuthBootstrap,
  AuthChangePasswordInput,
  AuthLoginInput,
  AuthSession,
  AuthSetupAdminInput,
  UserRecord
} from "../../shared/contracts";
import { randomUUID } from "node:crypto";
import { userRepository, type UserWriteRecord, type UserWithPasswordHash } from "../repositories/user-repository";
import { clearSession, createSession, getCurrentSession, requireSession } from "./auth-session";
import { hashPassword, verifyPassword } from "./auth-password";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const GENERIC_LOGIN_ERROR = "Usuário ou senha inválidos.";

const nowIso = (): string => new Date().toISOString();

const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const toWriteRecord = (user: UserWithPasswordHash): UserWriteRecord => ({
  id: user.id,
  name: user.name,
  username: user.username,
  passwordHash: user.passwordHash,
  role: user.role,
  status: user.status,
  lastLoginAt: user.lastLoginAt,
  failedLoginAttempts: user.failedLoginAttempts,
  lockedUntil: user.lockedUntil,
  mustChangePassword: user.mustChangePassword,
  allowRevealSecrets: user.allowRevealSecrets,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const isLocked = (user: UserWithPasswordHash): boolean =>
  Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());

const recordFailedAttempt = (user: UserWithPasswordHash): void => {
  const failedLoginAttempts = user.failedLoginAttempts + 1;
  const lockedUntil =
    failedLoginAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : user.lockedUntil;

  userRepository.update({
    ...toWriteRecord(user),
    failedLoginAttempts,
    lockedUntil,
    updatedAt: nowIso()
  });
};

const recordSuccessfulLogin = (user: UserWithPasswordHash): UserRecord => {
  const timestamp = nowIso();
  return userRepository.update({
    ...toWriteRecord(user),
    lastLoginAt: timestamp,
    failedLoginAttempts: 0,
    lockedUntil: null,
    updatedAt: timestamp
  });
};

export const authService = {
  getBootstrap(): AuthBootstrap {
    return {
      hasAdmin: userRepository.hasAnyAdmin(),
      session: getCurrentSession()
    };
  },

  setupAdmin(input: AuthSetupAdminInput): UserRecord {
    if (userRepository.hasAnyAdmin()) {
      throw new Error("Configuração inicial já foi concluída.");
    }

    const timestamp = nowIso();
    const username = normalizeUsername(input.username);

    return userRepository.insert({
      id: randomUUID(),
      name: input.name,
      username,
      passwordHash: hashPassword(input.password),
      role: "admin",
      status: "active",
      lastLoginAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      allowRevealSecrets: true,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  },

  login(input: AuthLoginInput): AuthSession {
    const user = userRepository.getByUsername(normalizeUsername(input.username));

    if (!user || user.status !== "active" || isLocked(user)) {
      throw new Error(GENERIC_LOGIN_ERROR);
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      recordFailedAttempt(user);
      throw new Error(GENERIC_LOGIN_ERROR);
    }

    return createSession(recordSuccessfulLogin(user));
  },

  logout(): { loggedOut: boolean } {
    clearSession();
    return { loggedOut: true };
  },

  getSession(): AuthSession | null {
    return getCurrentSession();
  },

  changeOwnPassword(input: AuthChangePasswordInput): AuthSession {
    const session = requireSession();
    const user = userRepository.getById(session.user.id);

    if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new Error("Senha atual inválida.");
    }

    const updated = userRepository.update({
      ...toWriteRecord(user),
      passwordHash: hashPassword(input.password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      updatedAt: nowIso()
    });

    return createSession(updated);
  }
};
