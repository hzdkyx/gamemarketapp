import type { CloudRole } from "../contracts/cloud-contracts.js";

export type CloudPermission =
  | "manageUsers"
  | "manageWorkspace"
  | "syncData"
  | "editProducts"
  | "editVariants"
  | "editOperationalStock"
  | "viewOrders"
  | "viewProfit"
  | "markReview"
  | "markDelivered"
  | "editNotes"
  | "read";

const roleRank: Record<CloudRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  operator: 2,
  viewer: 1,
};

export const canManageRole = (actorRole: CloudRole, targetRole: CloudRole): boolean => {
  if (actorRole === "owner") {
    return targetRole !== "owner";
  }

  if (actorRole === "admin") {
    return !["owner", "admin"].includes(targetRole);
  }

  return false;
};

export const hasCloudPermission = (role: CloudRole, permission: CloudPermission): boolean => {
  if (permission === "read" || permission === "viewOrders" || permission === "viewProfit") {
    return roleRank[role] >= roleRank.viewer;
  }

  if (permission === "syncData") {
    return roleRank[role] >= roleRank.operator;
  }

  if (permission === "manageUsers" || permission === "manageWorkspace") {
    return role === "owner" || role === "admin";
  }

  if (
    permission === "editProducts" ||
    permission === "editVariants" ||
    permission === "editOperationalStock" ||
    permission === "markReview"
  ) {
    return roleRank[role] >= roleRank.manager;
  }

  if (permission === "markDelivered" || permission === "editNotes") {
    return roleRank[role] >= roleRank.operator;
  }

  return false;
};
