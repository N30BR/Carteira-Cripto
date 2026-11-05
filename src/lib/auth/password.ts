import { hash, verify } from "@node-rs/argon2";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

/** Hash fixo usado quando o usuário não existe, para o login levar o mesmo tempo. */
export const DUMMY_HASH: Promise<string> = hash("senha-que-ninguem-usa-" + Math.random());
