import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

export const registerHealthRoutes = (app: FastifyInstance, config: AppConfig): void => {
  app.get("/health", async () => ({
    ok: true,
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: config.environment,
  }));
};
