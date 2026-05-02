import { getSqliteDatabase } from "../database/database";
import {
  toSqliteBoolean,
  toSqliteDate,
  toSqliteNullable,
} from "../database/sqlite-values";
import type {
  LocalRecoveryUserRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from "../../shared/contracts";

interface UserRow {
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

export interface UserWithPasswordHash extends UserRecord {
  passwordHash: string;
}

export interface UserWriteRecord {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  passwordHint: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  allowRevealSecrets: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserSqliteWriteRecord {
  id: string | null;
  name: string | null;
  username: string | null;
  passwordHash: string | null;
  passwordHint: string | null;
  role: string | null;
  status: string | null;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mustChangePassword: 0 | 1;
  allowRevealSecrets: 0 | 1;
  createdAt: string | null;
  updatedAt: string | null;
}

const toSqliteText = (value: unknown): string | null => {
  const sqliteValue = toSqliteNullable(value);

  if (sqliteValue === null) {
    return null;
  }

  return Buffer.isBuffer(sqliteValue)
    ? sqliteValue.toString("utf8")
    : String(sqliteValue);
};

const toSqliteNumber = (value: unknown): number => {
  const sqliteValue = toSqliteNullable(value);

  if (typeof sqliteValue === "number") {
    return sqliteValue;
  }

  if (typeof sqliteValue === "bigint") {
    return Number(sqliteValue);
  }

  if (typeof sqliteValue === "string") {
    const parsed = Number(sqliteValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

export const toSqliteUserWriteRecord = (
  user: UserWriteRecord,
): UserSqliteWriteRecord => ({
  id: toSqliteText(user.id),
  name: toSqliteText(user.name),
  username: toSqliteText(user.username),
  passwordHash: toSqliteText(user.passwordHash),
  passwordHint: toSqliteText(user.passwordHint),
  role: toSqliteText(user.role),
  status: toSqliteText(user.status),
  lastLoginAt: toSqliteDate(user.lastLoginAt),
  failedLoginAttempts: toSqliteNumber(user.failedLoginAttempts),
  lockedUntil: toSqliteDate(user.lockedUntil),
  mustChangePassword: toSqliteBoolean(user.mustChangePassword),
  allowRevealSecrets: toSqliteBoolean(user.allowRevealSecrets),
  createdAt: toSqliteDate(user.createdAt),
  updatedAt: toSqliteDate(user.updatedAt),
});

const mapUserRow = (row: UserRow): UserWithPasswordHash => ({
  id: row.id,
  name: row.name,
  username: row.username,
  passwordHash: row.password_hash,
  passwordHint: row.password_hint,
  role: row.role,
  status: row.status,
  lastLoginAt: row.last_login_at,
  failedLoginAttempts: row.failed_login_attempts,
  lockedUntil: row.locked_until,
  mustChangePassword: Boolean(row.must_change_password),
  allowRevealSecrets: Boolean(row.allow_reveal_secrets),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const withoutPasswordHash = (user: UserWithPasswordHash): UserRecord => {
  return {
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
  };
};

const toLocalRecoveryUser = (
  user: UserWithPasswordHash,
): LocalRecoveryUserRecord => ({
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
});

const userSelect = `
  SELECT
    id,
    name,
    username,
    password_hash,
    password_hint,
    role,
    status,
    last_login_at,
    failed_login_attempts,
    locked_until,
    must_change_password,
    allow_reveal_secrets,
    created_at,
    updated_at
  FROM users
`;

export const userRepository = {
  list(): UserRecord[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(`${userSelect} ORDER BY LOWER(name), LOWER(username)`)
      .all() as UserRow[];
    return rows.map(mapUserRow).map(withoutPasswordHash);
  },

  listLocalRecoveryUsers(): LocalRecoveryUserRecord[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(`${userSelect} ORDER BY LOWER(name), LOWER(username)`)
      .all() as UserRow[];
    return rows.map(mapUserRow).map(toLocalRecoveryUser);
  },

  getById(id: string): UserWithPasswordHash | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${userSelect} WHERE id = ?`).get(id) as
      | UserRow
      | undefined;
    return row ? mapUserRow(row) : null;
  },

  getByUsername(username: string): UserWithPasswordHash | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${userSelect} WHERE username = ?`).get(username) as
      | UserRow
      | undefined;
    return row ? mapUserRow(row) : null;
  },

  countActiveAdmins(exceptUserId?: string): number {
    const db = getSqliteDatabase();
    const row = db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM users
          WHERE role = 'admin'
            AND status = 'active'
            AND (@exceptUserId IS NULL OR id != @exceptUserId)
        `,
      )
      .get({ exceptUserId: exceptUserId ?? null }) as
      | { total: number }
      | undefined;

    return row?.total ?? 0;
  },

  hasAnyAdmin(): boolean {
    const db = getSqliteDatabase();
    const row = db
      .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")
      .get() as { total: number } | undefined;
    return (row?.total ?? 0) > 0;
  },

  insert(user: UserWriteRecord): UserRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        INSERT INTO users (
          id,
          name,
          username,
          password_hash,
          password_hint,
          role,
          status,
          last_login_at,
          failed_login_attempts,
          locked_until,
          must_change_password,
          allow_reveal_secrets,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @name,
          @username,
          @passwordHash,
          @passwordHint,
          @role,
          @status,
          @lastLoginAt,
          @failedLoginAttempts,
          @lockedUntil,
          @mustChangePassword,
          @allowRevealSecrets,
          @createdAt,
          @updatedAt
        )
      `,
    ).run(toSqliteUserWriteRecord(user));

    const created = this.getById(user.id);
    if (!created) {
      throw new Error("Usuário não foi criado.");
    }

    return withoutPasswordHash(created);
  },

  update(user: UserWriteRecord): UserRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        UPDATE users
        SET
          name = @name,
          username = @username,
          password_hash = @passwordHash,
          password_hint = @passwordHint,
          role = @role,
          status = @status,
          last_login_at = @lastLoginAt,
          failed_login_attempts = @failedLoginAttempts,
          locked_until = @lockedUntil,
          must_change_password = @mustChangePassword,
          allow_reveal_secrets = @allowRevealSecrets,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    ).run(toSqliteUserWriteRecord(user));

    const updated = this.getById(user.id);
    if (!updated) {
      throw new Error("Usuário não encontrado.");
    }

    return withoutPasswordHash(updated);
  },
};
