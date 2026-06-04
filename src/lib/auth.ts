import type { AuthUser } from "@/types/auth";

export const AUTH_COOKIE_NAME = "zucchi-auth";
export const AUTH_COOKIE_VALUE = "mock";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24;
export const AUTH_STORAGE_KEY = "zucchi-auth-user";

export const FALLBACK_USER: AuthUser = {
  login: "administrador",
  name: "Administrador",
  role: "Administrador"
};

export function isMockSession(value?: string) {
  return value === AUTH_COOKIE_VALUE;
}
