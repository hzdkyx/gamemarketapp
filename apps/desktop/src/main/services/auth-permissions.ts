import type { Permissions, UserRecord } from "../../shared/contracts";

export const getPermissionsForUser = (user: UserRecord): Permissions => ({
  canManageUsers: user.role === "admin",
  canManageSettings: user.role === "admin",
  canRevealSecrets:
    user.role === "admin" || (user.role === "operator" && user.allowRevealSecrets),
  canEditProducts: user.role === "admin" || user.role === "operator",
  canEditInventory: user.role === "admin" || user.role === "operator",
  canEditOrders: user.role === "admin" || user.role === "operator",
  canExportCsv: user.role === "admin" || user.role === "operator"
});

export const canAccessInventory = (user: UserRecord): boolean =>
  user.role === "admin" || user.role === "operator";
