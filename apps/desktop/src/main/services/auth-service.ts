import {
  LOCAL_RECOVERY_TEMPORARY_PASSWORD,
  authSetupAdminInputSchema,
  type AuthLocalPasswordResetInput,
  type AuthLocalPasswordResetResult,
  type AuthBootstrap,
  type AuthChangePasswordInput,
  type AuthLoginInput,
  type LocalRecoveryUserRecord,
  type AuthSession,
  type AuthSetupAdminInput,
  type UserRecord,
} from "../../shared/contracts";
import { randomUUID } from "node:crypto";
import {
  userRepository,
  type UserWriteRecord,
  type UserWithPasswordHash,
} from "../repositories/user-repository";
import { logger } from "../logger";
import {
  clearSession,
  createSession,
  getCurrentSession,
  requireSession,
} from "./auth-session";
import { hashPassword, verifyPassword } from "./auth-password";
import { eventService } from "./event-service";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const GENERIC_LOGIN_ERROR = "Usuário ou senha inválidos.";

const nowIso = (): string => new Date().toISOString();

const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase();

const setupUsernameForLog = (
  input: AuthSetupAdminInput,
): string | undefined => {
  const username = (input as { username?: unknown }).username;
  return typeof username === "string" ? normalizeUsername(username) : undefined;
};

const errorForLog = (
  error: unknown,
): { name: string; message: string; stack?: string } => {
  if (error instanceof Error) {
    const logError: { name: string; message: string; stack?: string } = {
      name: error.name,
      message: error.message,
    };

    if (error.stack) {
      logError.stack = error.stack;
    }

    return logError;
  }

  return {
    name: typeof error,
    message: String(error),
  };
};

const toWriteRecord = (user: UserWithPasswordHash): UserWriteRecord => ({
  id: user.id,
  name: user.name,
  username: user.username,
  passwordHash: user.passwordHash,
  passwordHint: user.passwordHint,
  role: user.role,
  status: user.status,
  lastLoginAt: user.lastLoginAt,
  failedLoginAttempts: user.failedLoginAttempts,
  lockedUntil: user.lockedUntil,
  mustChangePassword: user.mustChangePassword,
  allowRevealSecrets: user.allowRevealSecrets,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const isLocked = (user: UserWithPasswordHash): boolean =>
  Boolean(
    user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now(),
  );

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
    updatedAt: nowIso(),
  });
};

const recordSuccessfulLogin = (user: UserWithPasswordHash): UserRecord => {
  const timestamp = nowIso();
  return userRepository.update({
    ...toWriteRecord(user),
    lastLoginAt: timestamp,
    failedLoginAttempts: 0,
    lockedUntil: null,
    updatedAt: timestamp,
  });
};

export const authService = {
  getBootstrap(): AuthBootstrap {
    return {
      hasAdmin: userRepository.hasAnyAdmin(),
      session: getCurrentSession(),
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
        passwordHint: parsed.passwordHint ?? null,
        role: "admin",
        status: "active",
        lastLoginAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: false,
        allowRevealSecrets: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      logger.info(
        { userId: created.id, username: created.username },
        "Initial admin user created",
      );
      return created;
    } catch (error) {
      logger.error(
        { error: errorForLog(error), username: usernameForLog },
        "setupAdmin failed",
      );
      throw error;
    }
  },

  login(input: AuthLoginInput): AuthSession {
    const user = userRepository.getByUsername(
      normalizeUsername(input.username),
    );

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

  listLocalRecoveryUsers(): LocalRecoveryUserRecord[] {
    return userRepository.listLocalRecoveryUsers();
  },

  resetLocalPassword(
    input: AuthLocalPasswordResetInput,
  ): AuthLocalPasswordResetResult {
    if (getCurrentSession()) {
      throw new Error("Recuperação local disponível apenas antes do login.");
    }

    const current = userRepository.getById(input.userId);
    if (!current) {
      throw new Error("Usuário local não encontrado.");
    }

    if (normalizeUsername(input.usernameConfirmation) !== current.username) {
      throw new Error("Confirmação do usuário não confere.");
    }

    const updated = userRepository.update({
      ...toWriteRecord(current),
      passwordHash: hashPassword(LOCAL_RECOVERY_TEMPORARY_PASSWORD),
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
      updatedAt: nowIso(),
    });

    eventService.createInternal({
      type: "auth.local_password_reset",
      severity: "warning",
      title: "Senha local resetada",
      message:
        "Senha local resetada pelo fluxo de recuperação deste computador. Conta cloud e workspace não foram alterados.",
      actorUserId: null,
      rawPayload: {
        targetUserId: current.id,
        targetUsername: current.username,
        scope: "local_desktop",
      },
    });

    return {
      user: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        passwordHint: updated.passwordHint,
        role: updated.role,
        status: updated.status,
        lastLoginAt: updated.lastLoginAt,
        failedLoginAttempts: updated.failedLoginAttempts,
        lockedUntil: updated.lockedUntil,
        mustChangePassword: updated.mustChangePassword,
        createdAt: updated.createdAt,
      },
      mustChangePassword: true,
    };
  },

  changeOwnPassword(input: AuthChangePasswordInput): AuthSession {
    const session = requireSession();
    const user = userRepository.getById(session.user.id);

    if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw new Error("Senha atual inválida.");
    }

    if (input.password === LOCAL_RECOVERY_TEMPORARY_PASSWORD) {
      throw new Error("Escolha uma nova senha diferente da senha temporária.");
    }

    if (normalizeUsername(input.password) === user.username) {
      throw new Error("A nova senha não pode ser igual ao usuário.");
    }

    const updated = userRepository.update({
      ...toWriteRecord(user),
      passwordHash: hashPassword(input.password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      updatedAt: nowIso(),
    });

    return createSession(updated);
  },
};
