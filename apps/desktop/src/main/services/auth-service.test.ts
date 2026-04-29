import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRecord, UserRole, UserStatus } from "../../shared/contracts";
import type { UserWithPasswordHash, UserWriteRecord } from "../repositories/user-repository";

const state = vi.hoisted(() => ({
  users: new Map<string, UserWithPasswordHash>()
}));

const withoutHash = (user: UserWithPasswordHash): UserRecord => ({
  id: user.id,
  name: user.name,
  username: user.username,
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

const fromWrite = (write: UserWriteRecord): UserWithPasswordHash => ({
  id: write.id,
  name: write.name,
  username: write.username,
  passwordHash: write.passwordHash,
  role: write.role,
  status: write.status,
  lastLoginAt: write.lastLoginAt,
  failedLoginAttempts: write.failedLoginAttempts,
  lockedUntil: write.lockedUntil,
  mustChangePassword: write.mustChangePassword,
  allowRevealSecrets: write.allowRevealSecrets,
  createdAt: write.createdAt,
  updatedAt: write.updatedAt
});

vi.mock("../repositories/user-repository", () => ({
  userRepository: {
    list: () => [...state.users.values()].map(withoutHash),
    getById: (id: string) => state.users.get(id) ?? null,
    getByUsername: (username: string) =>
      [...state.users.values()].find((user) => user.username === username) ?? null,
    countActiveAdmins: (exceptUserId?: string) =>
      [...state.users.values()].filter(
        (user) =>
          user.id !== exceptUserId && user.role === "admin" && user.status === "active"
      ).length,
    hasAnyAdmin: () => [...state.users.values()].some((user) => user.role === "admin"),
    insert: (write: UserWriteRecord) => {
      const user = fromWrite(write);
      state.users.set(user.id, user);
      return withoutHash(user);
    },
    update: (write: UserWriteRecord) => {
      const user = fromWrite(write);
      state.users.set(user.id, user);
      return withoutHash(user);
    }
  }
}));

const { authService } = await import("./auth-service");
const { hashPassword } = await import("./auth-password");
const { clearSession, createSession } = await import("./auth-session");
const { userService } = await import("./user-service");

const makeUser = ({
  id = "admin-1",
  username = "admin",
  password = "senha-forte-1",
  role = "admin",
  status = "active"
}: {
  id?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
} = {}): UserWithPasswordHash => {
  const timestamp = new Date().toISOString();
  return {
    id,
    name: username,
    username,
    passwordHash: hashPassword(password),
    role,
    status,
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    allowRevealSecrets: role === "admin",
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

beforeEach(() => {
  clearSession();
  state.users.clear();
  state.users.set("admin-1", makeUser());
});

describe("auth service", () => {
  it("logs in with valid credentials and does not expose password hash", () => {
    const session = authService.login({ username: "ADMIN", password: "senha-forte-1" });

    expect(session.user.username).toBe("admin");
    expect("passwordHash" in session.user).toBe(false);
    expect(session.permissions.canManageUsers).toBe(true);
  });

  it("rejects invalid credentials with a generic message", () => {
    expect(() => authService.login({ username: "admin", password: "errada" })).toThrow(
      "Usuário ou senha inválidos."
    );
  });

  it("locks a user after repeated invalid login attempts", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => authService.login({ username: "admin", password: "errada" })).toThrow();
    }

    expect(state.users.get("admin-1")?.lockedUntil).toBeTruthy();
    expect(() => authService.login({ username: "admin", password: "senha-forte-1" })).toThrow(
      "Usuário ou senha inválidos."
    );
  });
});

describe("user service", () => {
  it("prevents disabling the last active admin", () => {
    const admin = state.users.get("admin-1");
    if (!admin) {
      throw new Error("Fixture admin missing.");
    }
    createSession(withoutHash(admin));

    expect(() =>
      userService.update({
        id: "admin-1",
        data: {
          status: "disabled"
        }
      })
    ).toThrow("Não é permitido desativar ou rebaixar o último admin ativo.");
  });
});
