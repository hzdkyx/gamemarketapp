import { describe, expect, it } from "vitest";
import type { UserRecord } from "../../shared/contracts";
import { getPermissionsForUser } from "./auth-permissions";

const user = (
  role: UserRecord["role"],
  allowRevealSecrets = false,
): UserRecord => ({
  id: `${role}-1`,
  name: role,
  username: role,
  passwordHint: null,
  role,
  status: "active",
  lastLoginAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  mustChangePassword: false,
  allowRevealSecrets,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("auth permissions", () => {
  it("grants full local permissions to admin", () => {
    expect(
      Object.values(getPermissionsForUser(user("admin"))).every(Boolean),
    ).toBe(true);
  });

  it("allows operators to edit operations and reveal secrets only when enabled", () => {
    expect(getPermissionsForUser(user("operator")).canRevealSecrets).toBe(
      false,
    );
    expect(getPermissionsForUser(user("operator", true)).canRevealSecrets).toBe(
      true,
    );
    expect(getPermissionsForUser(user("operator")).canEditOrders).toBe(true);
    expect(getPermissionsForUser(user("operator")).canManageUsers).toBe(false);
  });

  it("keeps viewers read-only and unable to export or reveal secrets", () => {
    const permissions = getPermissionsForUser(user("viewer"));

    expect(permissions.canRevealSecrets).toBe(false);
    expect(permissions.canEditProducts).toBe(false);
    expect(permissions.canExportCsv).toBe(false);
  });
});
