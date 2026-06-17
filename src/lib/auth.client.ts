"use client";

import { AUTH_STORAGE_KEY, FALLBACK_USER } from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

/**
 * O cookie de sessão (zucchi-auth) é HttpOnly e definido APENAS pelo servidor no
 * login — o cliente não pode lê-lo nem escrevê-lo. Aqui guardamos somente o
 * usuário de exibição (nome/cargo mostrados no header) no localStorage.
 */
export function createTemporarySession(user: AuthUser) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

/** Remove o usuário de exibição do localStorage (usado no logout). */
export function clearStoredUser() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getStoredAuthUser(): AuthUser {
  const storedUser = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!storedUser) {
    return FALLBACK_USER;
  }

  try {
    return { ...FALLBACK_USER, ...JSON.parse(storedUser) };
  } catch {
    return FALLBACK_USER;
  }
}
