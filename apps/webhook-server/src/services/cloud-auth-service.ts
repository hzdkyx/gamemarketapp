import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const passwordHashPrefix = "scrypt:v1";
const scryptKeyLength = 64;
const sessionTokenBytes = 32;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, scryptKeyLength)) as Buffer;
  return `${passwordHashPrefix}:${salt}:${key.toString("base64url")}`;
};

export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [algorithm, version, salt, expectedHash] = storedHash.split(":");
  if (`${algorithm}:${version}` !== passwordHashPrefix || !salt || !expectedHash) {
    return false;
  }

  const expected = Buffer.from(expectedHash, "base64url");
  const received = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export const createSessionToken = (): string => randomBytes(sessionTokenBytes).toString("base64url");

export const hashSessionToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const normalizeIdentifier = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
};
