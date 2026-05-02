import type { IpcMain } from "electron";
import {
  authChangePasswordInputSchema,
  authLocalPasswordResetInputSchema,
  authLoginInputSchema,
  authSetupAdminInputSchema,
  userCreateInputSchema,
  userResetPasswordInputSchema,
  userUpdateInputSchema,
} from "../../shared/contracts";
import { authService } from "../services/auth-service";
import { userService } from "../services/user-service";
import { startupProfiler } from "../startup-profiler";

export const registerAuthIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("auth:getBootstrap", () => {
    startupProfiler.mark("auth_check_start", { source: "bootstrap" });
    const bootstrap = authService.getBootstrap();
    startupProfiler.mark("auth_check_end", {
      source: "bootstrap",
      hasAdmin: bootstrap.hasAdmin,
    });
    return bootstrap;
  });

  ipcMain.handle("auth:setupAdmin", (_event, payload: unknown) =>
    authService.setupAdmin(authSetupAdminInputSchema.parse(payload)),
  );

  ipcMain.handle("auth:login", (_event, payload: unknown) =>
    authService.login(authLoginInputSchema.parse(payload)),
  );

  ipcMain.handle("auth:logout", () => authService.logout());

  ipcMain.handle("auth:getSession", () => {
    startupProfiler.mark("auth_check_start", { source: "session" });
    const session = authService.getSession();
    startupProfiler.mark("auth_check_end", {
      source: "session",
      hasSession: Boolean(session),
    });
    return session;
  });

  ipcMain.handle("auth:changeOwnPassword", (_event, payload: unknown) =>
    authService.changeOwnPassword(authChangePasswordInputSchema.parse(payload)),
  );

  ipcMain.handle("auth:listLocalRecoveryUsers", () =>
    authService.listLocalRecoveryUsers(),
  );

  ipcMain.handle("auth:resetLocalPassword", (_event, payload: unknown) =>
    authService.resetLocalPassword(
      authLocalPasswordResetInputSchema.parse(payload),
    ),
  );

  ipcMain.handle("users:list", () => userService.list());

  ipcMain.handle("users:create", (_event, payload: unknown) =>
    userService.create(userCreateInputSchema.parse(payload)),
  );

  ipcMain.handle("users:update", (_event, payload: unknown) =>
    userService.update(userUpdateInputSchema.parse(payload)),
  );

  ipcMain.handle("users:resetPassword", (_event, payload: unknown) =>
    userService.resetPassword(userResetPasswordInputSchema.parse(payload)),
  );
};
