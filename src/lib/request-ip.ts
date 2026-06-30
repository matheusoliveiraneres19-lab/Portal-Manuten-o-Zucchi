import type { NextRequest } from "next/server";

/**
 * Extrai o IP do cliente a partir dos cabeçalhos de proxy (Vercel popula
 * `x-forwarded-for`). Usado apenas para auditoria. Retorna null se ausente.
 */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}
