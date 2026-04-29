import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth-password";

describe("auth password hashing", () => {
  it("hashes passwords and verifies only the original value", () => {
    const hash = hashPassword("senha-forte-1");

    expect(hash).not.toBe("senha-forte-1");
    expect(verifyPassword("senha-forte-1", hash)).toBe(true);
    expect(verifyPassword("senha-incorreta", hash)).toBe(false);
  });
});
