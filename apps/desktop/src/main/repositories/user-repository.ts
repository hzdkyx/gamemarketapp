import { getSqliteDatabase } from "../database/database";
import type { UserRecord, UserRole, UserStatus } from "../../shared/contracts";

interface UserRow {
  id: string;
  name: string;
  username: string;
  password_hash: string;
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

const mapUserRow = (row: UserRow): UserWithPasswordHash => ({
  id: row.id,
  name: row.name,
  username: row.username,
  passwordHash: row.password_hash,
  role: row.role,
  status: row.status,
  lastLoginAt: row.last_login_at,
  failedLoginAttempts: row.failed_login_attempts,
  lockedUntil: row.locked_until,
  mustChangePassword: Boolean(row.must_change_password),
  allowRevealSecrets: Boolean(row.allow_reveal_secrets),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const withoutPasswordHash = (user: UserWithPasswordHash): UserRecord => {
  return {
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
  };
};

const userSelect = `
  SELECT
    id,
    name,
    username,
    password_hash,
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
    const rows = db.prepare(`${userSelect} ORDER BY LOWER(name), LOWER(username)`).all() as UserRow[];
    return rows.map(mapUserRow).map(withoutPasswordHash);
  },

  getById(id: string): UserWithPasswordHash | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${userSelect} WHERE id = ?`).get(id) as UserRow | undefined;
    return row ? mapUserRow(row) : null;
  },

  getByUsername(username: string): UserWithPasswordHash | null {
    const db = getSqliteDatabase();
    const row = db
      .prepare(`${userSelect} WHERE username = ?`)
      .get(username) as UserRow | undefined;
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
        `
      )
      .get({ exceptUserId: exceptUserId ?? null }) as { total: number } | undefined;

    return row?.total ?? 0;
  },

  hasAnyAdmin(): boolean {
    const db = getSqliteDatabase();
    const row = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").get() as
      | { total: number }
      | undefined;
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
      `
    ).run(user);

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
          role = @role,
          status = @status,
          last_login_at = @lastLoginAt,
          failed_login_attempts = @failedLoginAttempts,
          locked_until = @lockedUntil,
          must_change_password = @mustChangePassword,
          allow_reveal_secrets = @allowRevealSecrets,
          updated_at = @updatedAt
        WHERE id = @id
      `
    ).run(user);

    const updated = this.getById(user.id);
    if (!updated) {
      throw new Error("Usuário não encontrado.");
    }

    return withoutPasswordHash(updated);
  }
};
