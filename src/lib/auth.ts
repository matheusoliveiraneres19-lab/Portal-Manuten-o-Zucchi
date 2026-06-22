import type { AuthUser } from "@/types/auth";

export const AUTH_COOKIE_NAME = "zucchi-auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
/** Sessão limitada de primeiro acesso: só vale para trocar a senha. TTL curto. */
export const FIRST_ACCESS_MAX_AGE_SECONDS = 60 * 15;
/** Rota da troca de senha obrigatória no primeiro acesso. */
export const FIRST_ACCESS_PATH = "/primeiro-acesso";
export const AUTH_STORAGE_KEY = "zucchi-auth-user";

/** Usuário apenas de exibição (nome/cargo no header) quando não há nada salvo. */
export const FALLBACK_USER: AuthUser = {
  login: "administrador",
  name: "Administrador",
  role: "Administrador"
};

/**
 * Lê o segredo de assinatura de sessão. Retorna null se ausente ou muito curto
 * (mínimo 16 caracteres) — sem segredo, ninguém deve conseguir logar.
 */
export function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}
