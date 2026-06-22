/**
 * Sessão assinada com HMAC-SHA256 usando SOMENTE a Web Crypto API
 * (globalThis.crypto.subtle). Não importa "node:crypto" de propósito: assim o
 * mesmo código roda no middleware (Edge runtime) e nas rotas de API (Node).
 *
 * Formato do token: base64url(payload JSON) + "." + base64url(HMAC do payload).
 * Payload: { sub, name, role, exp (epoch em segundos) }.
 */

export type SessionPayload = {
  sub: string;
  name: string;
  role: string;
  exp: number;
  /**
   * Sessão de PRIMEIRO ACESSO (limitada): quando true, o usuário só pode trocar a
   * senha (/primeiro-acesso) — não acessa o dashboard. Ausente em sessões normais.
   */
  mustChange?: boolean;
};

function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hmacSha256(message: string, secret: string): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

/** Comparação em tempo constante para evitar timing attacks na assinatura. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Assina uma sessão. Calcula `exp = agora + maxAgeSeconds` e devolve o token
 * `payload.assinatura` (ambos em base64url, sem padding).
 */
export async function signSession(
  payload: { sub: string; name: string; role: string; mustChange?: boolean },
  secret: string,
  maxAgeSeconds: number
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  // Só inclui mustChange quando true, para manter o token enxuto e compatível.
  const fullPayload: SessionPayload = payload.mustChange
    ? { sub: payload.sub, name: payload.name, role: payload.role, mustChange: true, exp }
    : { sub: payload.sub, name: payload.name, role: payload.role, exp };
  const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(fullPayload)));
  const signature = await hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${base64urlEncode(signature)}`;
}

/**
 * Verifica a assinatura (em tempo constante) E a expiração.
 * Retorna o payload válido ou null em qualquer falha (token ausente, formato
 * inválido, assinatura incorreta ou sessão expirada).
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const [encodedPayload, encodedSignature] = parts;

  let expectedSignature: Uint8Array;
  let providedSignature: Uint8Array;
  try {
    expectedSignature = await hmacSha256(encodedPayload, secret);
    providedSignature = base64urlDecode(encodedSignature);
  } catch {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encodedPayload))) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
