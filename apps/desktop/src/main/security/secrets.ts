import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  decryptWithFallbackCipher,
  encryptWithFallbackCipher,
  isFallbackSecret
} from "./fallback-cipher";

const SAFE_STORAGE_PREFIX = "safe-storage:v1:";
const FALLBACK_KEY_FILE = "hzdk-local-secret-fallback.key";

const getFallbackKeyPath = (): string => join(app.getPath("userData"), FALLBACK_KEY_FILE);

const getFallbackKey = (): Buffer => {
  const keyPath = getFallbackKeyPath();
  mkdirSync(dirname(keyPath), { recursive: true });

  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf8"), "base64");
  }

  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
};

export interface SecretProtectionStatus {
  mode: "safeStorage" | "fallback-aes-gcm";
  safeStorageAvailable: boolean;
  warning?: string;
}

export const getSecretProtectionStatus = (): SecretProtectionStatus => {
  const safeStorageAvailable = safeStorage.isEncryptionAvailable();

  if (safeStorageAvailable) {
    return {
      mode: "safeStorage",
      safeStorageAvailable
    };
  }

  return {
    mode: "fallback-aes-gcm",
    safeStorageAvailable,
    warning:
      "safeStorage indisponível; usando AES-GCM com chave local em userData como fallback documentado."
  };
};

export const encryptLocalSecret = (plainText: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(plainText).toString("base64")}`;
  }

  // Fallback documentado: proteção local sem segredo hardcoded quando o cofre do SO não está disponível.
  return encryptWithFallbackCipher(plainText, getFallbackKey());
};

export const decryptLocalSecret = (encryptedValue: string): string => {
  if (encryptedValue.startsWith(SAFE_STORAGE_PREFIX)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage is required to decrypt this secret.");
    }

    return safeStorage.decryptString(
      Buffer.from(encryptedValue.slice(SAFE_STORAGE_PREFIX.length), "base64")
    );
  }

  if (isFallbackSecret(encryptedValue)) {
    return decryptWithFallbackCipher(encryptedValue, getFallbackKey());
  }

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encryptedValue, "base64"));
  }

  throw new Error("Unsupported secret format for the current protection mode.");
};
