import type { IpcMain } from "electron";
import {
  authChangePasswordInputSchema,
  authLoginInputSchema,
  authSetupAdminInputSchema,
  userCreateInputSchema,
  userResetPasswordInputSchema,
  userUpdateInputSchema
} from "../../shared/contracts";
import { authService } from "../services/auth-service";
import { userService } from "../services/user-service";

export const registerAuthIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("auth:getBootstrap", () => authService.getBootstrap());

  ipcMain.handle("auth:setupAdmin", (_event, payload: unknown) =>
    authService.setupAdmin(authSetupAdminInputSchema.parse(payload))
  );

  ipcMain.handle("auth:login", (_event, payload: unknown) =>
    authService.login(authLoginInputSchema.parse(payload))
  );

  ipcMain.handle("auth:logout", () => authService.logout());

  ipcMain.handle("auth:getSession", () => authService.getSession());

  ipcMain.handle("auth:changeOwnPassword", (_event, payload: unknown) =>
    authService.changeOwnPassword(authChangePasswordInputSchema.parse(payload))
  );

  ipcMain.handle("users:list", () => userService.list());

  ipcMain.handle("users:create", (_event, payload: unknown) =>
    userService.create(userCreateInputSchema.parse(payload))
  );

  ipcMain.handle("users:update", (_event, payload: unknown) =>
    userService.update(userUpdateInputSchema.parse(payload))
  );

  ipcMain.handle("users:resetPassword", (_event, payload: unknown) =>
    userService.resetPassword(userResetPasswordInputSchema.parse(payload))
  );
};
