import { randomUUID } from "node:crypto";
import type { UserCreateInput, UserRecord, UserResetPasswordInput, UserUpdateInput } from "../../shared/contracts";
import { userRepository, type UserWriteRecord, type UserWithPasswordHash } from "../repositories/user-repository";
import { requirePermission, updateCurrentSession } from "./auth-session";
import { hashPassword } from "./auth-password";

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

const assertUsernameAvailable = (username: string, exceptUserId?: string): void => {
  const duplicate = userRepository.getByUsername(username);
  if (duplicate && duplicate.id !== exceptUserId) {
    throw new Error("Já existe um usuário com este login.");
  }
};

const assertNotRemovingLastActiveAdmin = (
  current: UserWithPasswordHash,
  next: Pick<UserWriteRecord, "role" | "status">
): void => {
  const isCurrentActiveAdmin = current.role === "admin" && current.status === "active";
  const willRemainActiveAdmin = next.role === "admin" && next.status === "active";

  if (isCurrentActiveAdmin && !willRemainActiveAdmin && userRepository.countActiveAdmins(current.id) === 0) {
    throw new Error("Não é permitido desativar ou rebaixar o último admin ativo.");
  }
};

export const userService = {
  list(): UserRecord[] {
    requirePermission("canManageUsers");
    return userRepository.list();
  },

  create(input: UserCreateInput): UserRecord {
    requirePermission("canManageUsers");

    const username = normalizeUsername(input.username);
    assertUsernameAvailable(username);

    const timestamp = nowIso();
    return userRepository.insert({
      id: randomUUID(),
      name: input.name,
      username,
      passwordHash: hashPassword(input.password),
      role: input.role,
      status: input.status,
      lastLoginAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: input.mustChangePassword,
      allowRevealSecrets: input.allowRevealSecrets,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  },

  update(input: UserUpdateInput): UserRecord {
    requirePermission("canManageUsers");

    const current = userRepository.getById(input.id);
    if (!current) {
      throw new Error("Usuário não encontrado.");
    }

    const username = input.data.username ? normalizeUsername(input.data.username) : current.username;
    assertUsernameAvailable(username, current.id);

    const next: UserWriteRecord = {
      ...toWriteRecord(current),
      name: input.data.name ?? current.name,
      username,
      role: input.data.role ?? current.role,
      status: input.data.status ?? current.status,
      mustChangePassword: input.data.mustChangePassword ?? current.mustChangePassword,
      allowRevealSecrets: input.data.allowRevealSecrets ?? current.allowRevealSecrets,
      updatedAt: nowIso()
    };

    assertNotRemovingLastActiveAdmin(current, next);

    const updated = userRepository.update(next);
    updateCurrentSession(updated);
    return updated;
  },

  resetPassword(input: UserResetPasswordInput): UserRecord {
    requirePermission("canManageUsers");

    const current = userRepository.getById(input.id);
    if (!current) {
      throw new Error("Usuário não encontrado.");
    }

    const updated = userRepository.update({
      ...toWriteRecord(current),
      passwordHash: hashPassword(input.password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: input.mustChangePassword,
      updatedAt: nowIso()
    });

    updateCurrentSession(updated);
    return updated;
  }
};
