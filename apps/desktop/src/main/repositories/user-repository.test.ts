import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole, UserStatus } from "../../shared/contracts";
import type { UserWriteRecord } from "./user-repository";

interface UserRowFixture {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  password_hint: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  must_change_password: number;
  allow_reveal_secrets: number;
  created_at: string;
  updated_at: string;
}

const state = vi.hoisted(() => ({
  rows: new Map<string, UserRowFixture>(),
  lastRunParams: null as Record<string, unknown> | null,
}));

const rowFromParams = (params: Record<string, unknown>): UserRowFixture => ({
  id: params.id as string,
  name: params.name as string,
  username: params.username as string,
  password_hash: params.passwordHash as string,
  password_hint: params.passwordHint as string | null,
  role: params.role as UserRole,
  status: params.status as UserStatus,
  last_login_at: params.lastLoginAt as string | null,
  failed_login_attempts: params.failedLoginAttempts as number,
  locked_until: params.lockedUntil as string | null,
  must_change_password: params.mustChangePassword as number,
  allow_reveal_secrets: params.allowRevealSecrets as number,
  created_at: params.createdAt as string,
  updated_at: params.updatedAt as string,
});

vi.mock("../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => {
      if (sql.includes("INSERT INTO users")) {
        return {
          run: (params: Record<string, unknown>) => {
            state.lastRunParams = params;
            state.rows.set(params.id as string, rowFromParams(params));
            return { changes: 1 };
          },
        };
      }

      if (sql.includes("UPDATE users")) {
        return {
          run: (params: Record<string, unknown>) => {
            state.lastRunParams = params;
            const current = state.rows.get(params.id as string);
            state.rows.set(params.id as string, {
              ...(current ?? rowFromParams(params)),
              ...rowFromParams({
                ...params,
                createdAt: current?.created_at ?? params.createdAt,
              }),
            });
            return { changes: 1 };
          },
        };
      }

      if (sql.includes("WHERE id = ?")) {
        return {
          get: (id: string) => state.rows.get(id),
        };
      }

      if (sql.includes("WHERE username = ?")) {
        return {
          get: (username: string) =>
            [...state.rows.values()].find((row) => row.username === username),
        };
      }

      if (sql.includes("ORDER BY LOWER(name)")) {
        return {
          all: () => [...state.rows.values()],
        };
      }

      if (sql.includes("role = 'admin'") && sql.includes("status = 'active'")) {
        return {
          get: ({ exceptUserId }: { exceptUserId: string | null }) => ({
            total: [...state.rows.values()].filter(
              (row) =>
                row.id !== exceptUserId &&
                row.role === "admin" &&
                row.status === "active",
            ).length,
          }),
        };
      }

      if (sql.includes("role = 'admin'")) {
        return {
          get: () => ({
            total: [...state.rows.values()].filter(
              (row) => row.role === "admin",
            ).length,
          }),
        };
      }

      throw new Error(`Unexpected SQL in user repository test: ${sql}`);
    },
  }),
}));

const { userRepository } = await import("./user-repository");

const makeWriteRecord = (
  overrides: Partial<UserWriteRecord> = {},
): UserWriteRecord => {
  const timestamp = new Date("2026-04-29T12:00:00.000Z").toISOString();
  return {
    id: "admin-1",
    name: "Admin",
    username: "admin",
    passwordHash: "hashed-password",
    passwordHint: null,
    role: "admin",
    status: "active",
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    allowRevealSecrets: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
};

const expectOnlySqliteBindableValues = (
  params: Record<string, unknown>,
): void => {
  for (const value of Object.values(params)) {
    expect(value).not.toBeInstanceOf(Date);
    expect(typeof value).not.toBe("boolean");
    expect(
      value === null ||
        ["string", "number", "bigint"].includes(typeof value) ||
        Buffer.isBuffer(value),
    ).toBe(true);
  }
};

beforeEach(() => {
  state.rows.clear();
  state.lastRunParams = null;
});

describe("user repository", () => {
  it("normalizes inserted user values before binding them to SQLite", () => {
    const createdAt = new Date("2026-04-29T13:00:00.000Z");
    const lockedUntil = new Date("2026-04-29T13:05:00.000Z");

    const created = userRepository.insert(
      makeWriteRecord({
        lastLoginAt: undefined as unknown as string | null,
        lockedUntil: lockedUntil as unknown as string,
        createdAt: createdAt as unknown as string,
        updatedAt: createdAt as unknown as string,
      }),
    );

    expect(created.username).toBe("admin");
    expect(created.passwordHint).toBe(null);
    expect(created.mustChangePassword).toBe(false);
    expect(created.allowRevealSecrets).toBe(true);
    expect(state.lastRunParams).toMatchObject({
      lastLoginAt: null,
      lockedUntil: lockedUntil.toISOString(),
      mustChangePassword: 0,
      allowRevealSecrets: 1,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
    expectOnlySqliteBindableValues(state.lastRunParams ?? {});
  });

  it("lists recovery users without password hashes", () => {
    userRepository.insert(makeWriteRecord({ passwordHint: "frase segura" }));

    const users = userRepository.listLocalRecoveryUsers();

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      username: "admin",
      passwordHint: "frase segura",
      role: "admin",
      status: "active",
    });
    expect("passwordHash" in (users[0] ?? {})).toBe(false);
  });

  it("normalizes updated user values before binding them to SQLite", () => {
    userRepository.insert(makeWriteRecord());

    const updatedAt = new Date("2026-04-29T14:00:00.000Z");
    const updated = userRepository.update(
      makeWriteRecord({
        failedLoginAttempts: "3" as unknown as number,
        passwordHint: "frase segura",
        mustChangePassword: true,
        allowRevealSecrets: false,
        updatedAt: updatedAt as unknown as string,
      }),
    );

    expect(updated.failedLoginAttempts).toBe(3);
    expect(updated.passwordHint).toBe("frase segura");
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.allowRevealSecrets).toBe(false);
    expect(state.lastRunParams).toMatchObject({
      failedLoginAttempts: 3,
      passwordHint: "frase segura",
      mustChangePassword: 1,
      allowRevealSecrets: 0,
      updatedAt: updatedAt.toISOString(),
    });
    expectOnlySqliteBindableValues(state.lastRunParams ?? {});
  });
});
