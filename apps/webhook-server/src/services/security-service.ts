import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

const secureDigest = (value: string): Buffer => createHash("sha256").update(value).digest();

export const secureCompare = (received: string, expected: string): boolean => {
  const receivedDigest = secureDigest(received);
  const expectedDigest = secureDigest(expected);
  return timingSafeEqual(receivedDigest, expectedDigest);
};

export const validateWebhookSecret = (secret: string, config: AppConfig): boolean =>
  secureCompare(secret, config.webhookIngestSecret);

export const requireAppSyncToken = (request: FastifyRequest, config: AppConfig): void => {
  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;

  if (!value?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Authorization bearer token required."), { statusCode: 401 });
  }

  const token = value.slice("Bearer ".length).trim();
  if (!token || !secureCompare(token, config.appSyncToken)) {
    throw Object.assign(new Error("Invalid app sync token."), { statusCode: 401 });
  }
};
