import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWithFallbackCipher, encryptWithFallbackCipher, isFallbackSecret } from "./fallback-cipher";

describe("fallback secret cipher", () => {
  it("encrypts and decrypts without exposing the plain value", () => {
    const key = randomBytes(32);
    const encrypted = encryptWithFallbackCipher("senha-local", key);

    expect(isFallbackSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain("senha-local");
    expect(decryptWithFallbackCipher(encrypted, key)).toBe("senha-local");
  });

  it("rejects decrypting with a different key", () => {
    const encrypted = encryptWithFallbackCipher("senha-local", randomBytes(32));

    expect(() => decryptWithFallbackCipher(encrypted, randomBytes(32))).toThrow();
  });
});
