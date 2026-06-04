"use client";

import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_VALUE,
  AUTH_STORAGE_KEY,
  FALLBACK_USER
} from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

export function createTemporarySession(user: AuthUser) {
  document.cookie = `${AUTH_COOKIE_NAME}=${AUTH_COOKIE_VALUE}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

export function clearTemporarySession() {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
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
