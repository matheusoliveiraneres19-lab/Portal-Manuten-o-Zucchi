import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Detecta se o valor armazenado já é um hash bcrypt ($2a$/$2b$/$2y$). */
export function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

/** Gera o hash bcrypt de uma senha em texto puro. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Confere a senha contra o valor armazenado.
 *
 * Compatibilidade: se o armazenado ainda for texto puro (legado, antes do
 * bcrypt), compara diretamente. O chamador pode então re-hashear no login
 * (upgrade transparente) — ver src/app/api/auth/login/route.ts.
 */
export function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Legado: senha em texto puro. Será migrada para bcrypt no próximo login.
  return Promise.resolve(plain === stored);
}
