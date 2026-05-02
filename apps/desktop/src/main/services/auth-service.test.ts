import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRecord, UserRole, UserStatus } from "../../shared/contracts";
import type {
  UserWithPasswordHash,
  UserWriteRecord,
} from "../repositories/user-repository";

const state = vi.hoisted(() => ({
  users: new Map<string, UserWithPasswordHash>(),
  events: [] as unknown[],
}));

const withoutHash = (user: UserWithPasswordHash): UserRecord => ({
  id: user.id,
  name: user.name,
  username: user.username,
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

const fromWrite = (write: UserWriteRecord): UserWithPasswordHash => ({
  id: write.id,
  name: write.name,
  username: write.username,
  passwordHash: write.passwordHash,
  passwordHint: write.passwordHint,
  role: write.role,
  status: write.status,
  lastLoginAt: write.lastLoginAt,
  failedLoginAttempts: write.failedLoginAttempts,
  lockedUntil: write.lockedUntil,
  mustChangePassword: write.mustChangePassword,
  allowRevealSecrets: write.allowRevealSecrets,
  createdAt: write.createdAt,
  updatedAt: write.updatedAt,
});

vi.mock("../repositories/user-repository", () => ({
  userRepository: {
    list: () => [...state.users.values()].map(withoutHash),
    listLocalRecoveryUsers: () =>
      [...state.users.values()].map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
        passwordHint: user.passwordHint,
        role: user.role,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      })),
    getById: (id: string) => state.users.get(id) ?? null,
    getByUsername: (username: string) =>
      [...state.users.values()].find((user) => user.username === username) ??
      null,
    countActiveAdmins: (exceptUserId?: string) =>
      [...state.users.values()].filter(
        (user) =>
          user.id !== exceptUserId &&
          user.role === "admin" &&
          user.status === "active",
      ).length,
    hasAnyAdmin: () =>
      [...state.users.values()].some((user) => user.role === "admin"),
    insert: (write: UserWriteRecord) => {
      const user = fromWrite(write);
      state.users.set(user.id, user);
      return withoutHash(user);
    },
    update: (write: UserWriteRecord) => {
      const user = fromWrite(write);
      state.users.set(user.id, user);
      return withoutHash(user);
    },
  },
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./event-service", () => ({
  eventService: {
    createInternal: (input: unknown) => {
      state.events.push(input);
      return input;
    },
  },
}));

const { authService } = await import("./auth-service");
const { hashPassword, verifyPassword } = await import("./auth-password");
const { clearSession, createSession } = await import("./auth-session");
const { userService } = await import("./user-service");
const { LOCAL_RECOVERY_TEMPORARY_PASSWORD } =
  await import("../../shared/contracts");

const makeUser = ({
  id = "admin-1",
  username = "admin",
  password = "senha-forte-1",
  role = "admin",
  status = "active",
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
    passwordHint: null,
    role,
    status,
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    allowRevealSecrets: role === "admin",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

beforeEach(() => {
  clearSession();
  state.users.clear();
  state.events = [];
  state.users.set("admin-1", makeUser());
});

describe("auth service", () => {
  it("creates the initial admin and allows login after setup", () => {
    state.users.clear();

    const admin = authService.setupAdmin({
      name: "Admin Local",
      username: "Admin.Local",
      password: "senha-forte-1",
      confirmPassword: "senha-forte-1",
      passwordHint: "senha que uso no app",
    });

    expect(admin.role).toBe("admin");
    expect(admin.status).toBe("active");
    expect(admin.username).toBe("admin.local");
    expect(admin.passwordHint).toBe("senha que uso no app");
    expect(admin.mustChangePassword).toBe(false);
    expect(admin.allowRevealSecrets).toBe(true);
    expect("passwordHash" in admin).toBe(false);

    const session = authService.login({
      username: "admin.local",
      password: "senha-forte-1",
    });
    expect(session.user.id).toBe(admin.id);
    expect(session.permissions.canManageUsers).toBe(true);
  });

  it("rejects weak initial admin passwords", () => {
    state.users.clear();

    expect(() =>
      authService.setupAdmin({
        name: "Admin Local",
        username: "admin.local",
        password: "curta",
        confirmPassword: "curta",
      }),
    ).toThrow();
  });

  it("rejects mismatched initial admin password confirmation", () => {
    state.users.clear();

    expect(() =>
      authService.setupAdmin({
        name: "Admin Local",
        username: "admin.local",
        password: "senha-forte-1",
        confirmPassword: "senha-diferente",
      }),
    ).toThrow();
  });

  it("does not create a second initial admin", () => {
    expect(() =>
      authService.setupAdmin({
        name: "Outro Admin",
        username: "outro.admin",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1",
      }),
    ).toThrow("Configuração inicial já foi concluída.");
  });

  it("logs in with valid credentials and does not expose password hash", () => {
    const session = authService.login({
      username: "ADMIN",
      password: "senha-forte-1",
    });

    expect(session.user.username).toBe("admin");
    expect("passwordHash" in session.user).toBe(false);
    expect(session.permissions.canManageUsers).toBe(true);
  });

  it("rejects invalid credentials with a generic message", () => {
    expect(() =>
      authService.login({ username: "admin", password: "errada" }),
    ).toThrow("Usuário ou senha inválidos.");
  });

  it("locks a user after repeated invalid login attempts", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() =>
        authService.login({ username: "admin", password: "errada" }),
      ).toThrow();
    }

    expect(state.users.get("admin-1")?.lockedUntil).toBeTruthy();
    expect(() =>
      authService.login({ username: "admin", password: "senha-forte-1" }),
    ).toThrow("Usuário ou senha inválidos.");
  });

  it("lists local recovery users without password hashes", () => {
    const recoveryUsers = authService.listLocalRecoveryUsers();

    expect(recoveryUsers).toHaveLength(1);
    expect(recoveryUsers[0]).toMatchObject({
      id: "admin-1",
      username: "admin",
      passwordHint: null,
      role: "admin",
      status: "active",
    });
    expect("passwordHash" in (recoveryUsers[0] ?? {})).toBe(false);
  });

  it("resets only the local password and requires password change on next login", () => {
    const admin = state.users.get("admin-1");
    if (!admin) {
      throw new Error("Fixture admin missing.");
    }
    state.users.set("admin-1", {
      ...admin,
      role: "operator",
      failedLoginAttempts: 4,
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    });

    const result = authService.resetLocalPassword({
      userId: "admin-1",
      usernameConfirmation: "admin",
      confirmLocalOnly: true,
      confirmTemporaryPassword: true,
    });
    const updated = state.users.get("admin-1");

    expect(result.user.username).toBe("admin");
    expect("passwordHash" in result.user).toBe(false);
    expect(updated?.role).toBe("operator");
    expect(updated?.failedLoginAttempts).toBe(0);
    expect(updated?.lockedUntil).toBeNull();
    expect(updated?.mustChangePassword).toBe(true);
    expect(updated?.passwordHash).not.toBe(admin.passwordHash);
    expect(
      verifyPassword(
        LOCAL_RECOVERY_TEMPORARY_PASSWORD,
        updated?.passwordHash ?? "",
      ),
    ).toBe(true);

    const session = authService.login({
      username: "admin",
      password: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
    });
    expect(session.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(state.events)).toContain("auth.local_password_reset");
    expect(JSON.stringify(state.events)).not.toContain(
      LOCAL_RECOVERY_TEMPORARY_PASSWORD,
    );
  });

  it("rejects local reset when username confirmation does not match", () => {
    expect(() =>
      authService.resetLocalPassword({
        userId: "admin-1",
        usernameConfirmation: "outro",
        confirmLocalOnly: true,
        confirmTemporaryPassword: true,
      }),
    ).toThrow("Confirmação do usuário não confere.");
  });

  it("blocks temporary and username passwords during mandatory password change", () => {
    const admin = state.users.get("admin-1");
    if (!admin) {
      throw new Error("Fixture admin missing.");
    }
    state.users.set("admin-1", {
      ...admin,
      passwordHash: hashPassword(LOCAL_RECOVERY_TEMPORARY_PASSWORD),
      mustChangePassword: true,
    });

    authService.login({
      username: "admin",
      password: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
    });

    expect(() =>
      authService.changeOwnPassword({
        currentPassword: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
        password: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
        confirmPassword: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
      }),
    ).toThrow("Escolha uma nova senha diferente da senha temporária.");

    expect(() =>
      authService.changeOwnPassword({
        currentPassword: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
        password: "admin",
        confirmPassword: "admin",
      }),
    ).toThrow("A nova senha não pode ser igual ao usuário.");

    const session = authService.changeOwnPassword({
      currentPassword: LOCAL_RECOVERY_TEMPORARY_PASSWORD,
      password: "nova-senha-local-1",
      confirmPassword: "nova-senha-local-1",
    });
    expect(session.user.mustChangePassword).toBe(false);
  });
});

describe("user service", () => {
  it("stores and updates password hints without exposing password hashes", () => {
    const admin = state.users.get("admin-1");
    if (!admin) {
      throw new Error("Fixture admin missing.");
    }
    createSession(withoutHash(admin));

    const created = userService.create({
      name: "Operador",
      username: "operador",
      password: "senha-forte-2",
      confirmPassword: "senha-forte-2",
      passwordHint: "padrão da empresa",
      role: "operator",
      status: "active",
      allowRevealSecrets: false,
      mustChangePassword: true,
    });

    expect(created.passwordHint).toBe("padrão da empresa");
    expect("passwordHash" in created).toBe(false);

    const updated = userService.update({
      id: created.id,
      data: {
        passwordHint: "nova frase segura",
      },
    });
    expect(updated.passwordHint).toBe("nova frase segura");
  });

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
          status: "disabled",
        },
      }),
    ).toThrow("Não é permitido desativar ou rebaixar o último admin ativo.");
  });
});
