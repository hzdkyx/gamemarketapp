import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export const hashPassword = (password: string): string => bcrypt.hashSync(password, BCRYPT_COST);

export const verifyPassword = (password: string, passwordHash: string): boolean =>
  bcrypt.compareSync(password, passwordHash);
