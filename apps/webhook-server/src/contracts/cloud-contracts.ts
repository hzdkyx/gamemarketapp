import { z } from "zod";

export const cloudRoleValues = ["owner", "admin", "manager", "operator", "viewer"] as const;
export const cloudUserStatusValues = ["active", "disabled"] as const;
export const cloudSyncEntityTypeValues = [
  "products",
  "product_variants",
  "inventory_items",
  "orders",
  "events",
  "app_notifications",
  "settings",
] as const;
export const cloudSyncStatusValues = ["synced", "conflict"] as const;

const identifierSchema = z.string().trim().min(3).max(160);
const passwordSchema = z.string().min(8).max(200);
const nullableDateTimeSchema = z.string().trim().datetime().nullable().optional();
const nullableEmailSchema = z.string().trim().email().max(160).nullable().optional();
const nullableUsernameSchema = z.string().trim().min(3).max(80).nullable().optional();

export const cloudRoleSchema = z.enum(cloudRoleValues);
export const cloudUserStatusSchema = z.enum(cloudUserStatusValues);
export const cloudSyncEntityTypeSchema = z.enum(cloudSyncEntityTypeValues);

export const cloudLoginInputSchema = z
  .object({
    identifier: identifierSchema,
    password: passwordSchema,
  })
  .strict();

export const cloudChangePasswordInputSchema = z
  .object({
    currentPassword: passwordSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const cloudBootstrapOwnerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: nullableEmailSchema,
    username: nullableUsernameSchema,
    password: passwordSchema,
    workspaceName: z.string().trim().min(2).max(120).default("HzdKyx GameMarket"),
  })
  .strict()
  .refine((input) => Boolean(input.email || input.username), {
    message: "Informe e-mail ou usuário.",
    path: ["identifier"],
  });

export const cloudCreateWorkspaceInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export const cloudWorkspaceParamsSchema = z.object({ id: z.string().trim().min(1) }).strict();
export const cloudWorkspaceMemberParamsSchema = z
  .object({
    id: z.string().trim().min(1),
    memberId: z.string().trim().min(1),
  })
  .strict();

export const cloudInviteUserInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: nullableEmailSchema,
    username: nullableUsernameSchema,
    password: passwordSchema,
    role: cloudRoleSchema.exclude(["owner"]).default("manager"),
  })
  .strict()
  .refine((input) => Boolean(input.email || input.username), {
    message: "Informe e-mail ou usuário.",
    path: ["identifier"],
  });

const cloudWorkspaceMemberUpdateFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: nullableEmailSchema,
    username: nullableUsernameSchema,
    role: cloudRoleSchema.optional(),
    status: cloudUserStatusSchema.optional(),
  })
  .strict();

const hasWorkspaceMemberUpdates = (input: {
  name?: string;
  email?: string | null;
  username?: string | null;
  role?: CloudRole;
  status?: CloudUserStatus;
}): boolean => Object.values(input).some((value) => value !== undefined);

export const cloudWorkspaceMemberUpdateInputSchema = cloudWorkspaceMemberUpdateFieldsSchema
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe pelo menos um campo para atualizar.",
  });

export const cloudUpdateMemberInputSchema = cloudWorkspaceMemberUpdateFieldsSchema
  .extend({
    userId: z.string().trim().min(1),
  })
  .refine(
    (input) =>
      hasWorkspaceMemberUpdates({
        name: input.name,
        email: input.email,
        username: input.username,
        role: input.role,
        status: input.status,
      }),
    {
      message: "Informe pelo menos um campo para atualizar.",
    },
  );

export const cloudRemoveMemberInputSchema = z
  .object({
    confirmation: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .optional()
  .default({});

export const cloudResetMemberPasswordInputSchema = z
  .object({
    temporaryPassword: passwordSchema,
    confirmPassword: passwordSchema.optional(),
    mustChangePassword: z.boolean().optional(),
    requireChange: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.confirmPassword !== undefined && input.temporaryPassword !== input.confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "As senhas não conferem.",
        path: ["confirmPassword"],
      });
    }
  })
  .transform((input) => ({
    temporaryPassword: input.temporaryPassword,
    mustChangePassword: input.requireChange ?? input.mustChangePassword ?? true,
  }));

export const cloudSyncPullQuerySchema = z
  .object({
    workspaceId: z.string().trim().min(1).optional(),
    since: z.string().trim().datetime().optional(),
  })
  .strict();

export const cloudSyncStatusQuerySchema = cloudSyncPullQuerySchema;

export const cloudSyncEntityChangeSchema = z
  .object({
    entityType: cloudSyncEntityTypeSchema,
    localId: z.string().trim().min(1),
    cloudId: z.string().trim().min(1).optional(),
    baseVersion: z.number().int().nonnegative().default(0),
    updatedAt: z.string().trim().datetime(),
    deletedAt: nullableDateTimeSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const cloudSyncEntityChangesSchema = z.array(cloudSyncEntityChangeSchema).max(1000);

export const cloudSyncPushInputSchema = z
  .object({
    workspaceId: z.string().trim().min(1),
    entities: cloudSyncEntityChangesSchema.optional(),
    changes: cloudSyncEntityChangesSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.entities && !input.changes) {
      context.addIssue({
        code: "custom",
        path: ["entities"],
        message: "Informe entities como array, mesmo vazio.",
      });
    }
  })
  .transform((input) => ({
    workspaceId: input.workspaceId,
    entities: input.entities ?? input.changes ?? [],
  }));

export interface CloudUserView {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: CloudRole;
  status: CloudUserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorkspaceView {
  id: string;
  name: string;
  role: CloudRole;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorkspaceMemberView extends CloudUserView {
  membershipId: string;
  workspaceId: string;
}

export interface CloudAuditLogView {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CloudSessionView {
  user: CloudUserView;
  workspaces: CloudWorkspaceView[];
}

export interface CloudSyncEntityView {
  cloudId: string;
  workspaceId: string;
  entityType: CloudSyncEntityType;
  localId: string;
  payload: Record<string, unknown>;
  version: number;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CloudSyncConflictView {
  id: string;
  workspaceId: string;
  entityType: CloudSyncEntityType;
  localId: string;
  cloudId: string;
  remoteVersion: number;
  incomingBaseVersion: number;
  createdAt: string;
}

export interface CloudSyncWorkspaceStatus {
  workspaceVersion: number;
  lastUpdatedAt: string | null;
  pendingServerChanges: number;
}

export type CloudRole = (typeof cloudRoleValues)[number];
export type CloudUserStatus = (typeof cloudUserStatusValues)[number];
export type CloudSyncEntityType = (typeof cloudSyncEntityTypeValues)[number];
export type CloudLoginInput = z.infer<typeof cloudLoginInputSchema>;
export type CloudChangePasswordInput = z.infer<typeof cloudChangePasswordInputSchema>;
export type CloudBootstrapOwnerInput = z.infer<typeof cloudBootstrapOwnerInputSchema>;
export type CloudCreateWorkspaceInput = z.infer<typeof cloudCreateWorkspaceInputSchema>;
export type CloudInviteUserInput = z.infer<typeof cloudInviteUserInputSchema>;
export type CloudUpdateMemberInput = z.infer<typeof cloudUpdateMemberInputSchema>;
export type CloudWorkspaceMemberUpdateInput = z.infer<typeof cloudWorkspaceMemberUpdateInputSchema>;
export type CloudRemoveMemberInput = z.infer<typeof cloudRemoveMemberInputSchema>;
export type CloudResetMemberPasswordInput = z.infer<typeof cloudResetMemberPasswordInputSchema>;
export type CloudSyncPushInput = z.infer<typeof cloudSyncPushInputSchema>;
export type CloudSyncEntityChange = z.infer<typeof cloudSyncEntityChangeSchema>;
export type CloudSyncStatusQuery = z.infer<typeof cloudSyncStatusQuerySchema>;
