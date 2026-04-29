import {
  authSetupAdminInputSchema,
  type AuthBootstrap,
  type AuthChangePasswordInput,
  type AuthLoginInput,
  type AuthSession,
  type AuthSetupAdminInput,
  type UserRecord
} from "../../shared/contracts";
import { randomUUID } from "node:crypto";
import { userRepository, type UserWriteRecord, type UserWithPasswordHash } from "../repositories/user-repository";
import { logger } from "../logger";
import { clearSession, createSession, getCurrentSession, requireSession } from "./auth-session";
import { hashPassword, verifyPassword } from "./auth-password";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const GENERIC_LOGIN_ERROR = "Usuário ou senha inválidos.";

const nowIso = (): string => new Date().toISOString();

const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const setupUsernameForLog = (input: AuthSetupAdminInput): string | undefined => {
  const username = (input as { username?: unknown }).username;
  return typeof username === "string" ? normalizeUsername(username) : undefined;
};

const errorForLog = (error: unknown): { name: string; message: string; stack?: string } => {
  if (error instanceof Error) {
    const logError: { name: string; message: string; stack?: string } = {
      name: error.name,
      message: error.message
    };

    if (error.stack) {
      logError.stack = error.stack;
    }

    return logError;
  }

  return {
    name: typeof error,
    message: String(error)
  };
};

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
    const usernameForLog = setupUsernameForLog(input);
    logger.info({ username: usernameForLog }, "setupAdmin started");

    try {
      const parsed = authSetupAdminInputSchema.parse(input);

      if (userRepository.hasAnyAdmin()) {
        throw new Error("Configuração inicial já foi concluída.");
      }

      const timestamp = nowIso();
      const username = normalizeUsername(parsed.username);

      const created = userRepository.insert({
        id: randomUUID(),
        name: parsed.name,
        username,
        passwordHash: hashPassword(parsed.password),
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

      logger.info({ userId: created.id, username: created.username }, "Initial admin user created");
      return created;
    } catch (error) {
      logger.error({ error: errorForLog(error), username: usernameForLog }, "setupAdmin failed");
      throw error;
    }
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
