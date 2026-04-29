import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const FALLBACK_PREFIX = "fallback-aes-gcm:v1:";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const isFallbackSecret = (encryptedValue: string): boolean =>
  encryptedValue.startsWith(FALLBACK_PREFIX);

export const encryptWithFallbackCipher = (plainText: string, key: Buffer): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${FALLBACK_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString("base64")}`;
};

export const decryptWithFallbackCipher = (encryptedValue: string, key: Buffer): string => {
  if (!isFallbackSecret(encryptedValue)) {
    throw new Error("Unsupported fallback secret payload.");
  }

  const payload = Buffer.from(encryptedValue.slice(FALLBACK_PREFIX.length), "base64");
  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};
