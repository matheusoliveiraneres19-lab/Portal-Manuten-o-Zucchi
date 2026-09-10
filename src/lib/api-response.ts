/**
 * Respostas HTTP padronizadas das rotas de API.
 *
 * PROBLEMA QUE ISTO RESOLVE
 * -------------------------
 * Hoje cada rota inventa o próprio formato: `/api/pc-factory/import` devolve
 * `{ error }`, `/api/purchases/import` devolve `{ success, message, details }`.
 * Pior: quando a função serverless estoura tempo/memória, a Vercel devolve uma
 * página HTML de erro — e o `await res.json()` do front quebra com
 * "Unexpected token '<'", escondendo a causa real.
 *
 * CONTRATO ÚNICO
 * --------------
 *   sucesso: { success: true,  data: <payload> }
 *   erro:    { success: false, error: string, details?: string, code?: string }
 *
 * `error` é a mensagem que PODE ser mostrada ao usuário. `details` é o
 * diagnóstico técnico. `code` é estável e serve para o front decidir o que
 * fazer sem depender de texto.
 *
 * As rotas antigas NÃO foram migradas — o front delas já espera o formato
 * atual. Este helper é para rotas novas e para a migração do PC-Factory na
 * próxima etapa.
 */
import { NextResponse } from "next/server";

/** Códigos estáveis de erro. O front pode ramificar por eles com segurança. */
export const API_ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  CONFLICT: "CONFLICT",
  STORAGE_NOT_CONFIGURED: "STORAGE_NOT_CONFIGURED",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export type ApiSuccess<T> = { success: true; data: T };

export type ApiFailure = {
  success: false;
  error: string;
  details?: string;
  code?: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/* -------------------------------------------------------------------------- */
/*  Sucesso                                                                    */
/* -------------------------------------------------------------------------- */

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data },
    { status: init?.status ?? 200, headers: init?.headers }
  );
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

/* -------------------------------------------------------------------------- */
/*  Erro                                                                       */
/* -------------------------------------------------------------------------- */

export function fail(status: number, error: string, details?: string, code?: string) {
  const body: ApiFailure = { success: false, error };
  if (details) body.details = details;
  if (code) body.code = code;
  return NextResponse.json<ApiFailure>(body, { status });
}

export function badRequest(message: string, details?: string) {
  return fail(400, message, details, API_ERROR_CODES.BAD_REQUEST);
}

export function unauthorized(message = "Sessão expirada. Faça login novamente.", details?: string) {
  return fail(401, message, details, API_ERROR_CODES.UNAUTHORIZED);
}

export function forbidden(message = "Você não tem permissão para esta ação.", details?: string) {
  return fail(403, message, details, API_ERROR_CODES.FORBIDDEN);
}

export function notFound(message = "Registro não encontrado.", details?: string) {
  return fail(404, message, details, API_ERROR_CODES.NOT_FOUND);
}

export function conflict(message: string, details?: string) {
  return fail(409, message, details, API_ERROR_CODES.CONFLICT);
}

/**
 * 413 — arquivo/corpo acima do limite. Importante para importação: a função
 * serverless da Vercel corta o corpo em ~4,5 MB, então é melhor recusar cedo com
 * uma mensagem clara do que deixar a plataforma devolver HTML.
 */
export function tooLarge(message: string, details?: string) {
  return fail(413, message, details, API_ERROR_CODES.PAYLOAD_TOO_LARGE);
}

export function unsupportedMediaType(message: string, details?: string) {
  return fail(415, message, details, API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
}

/** 503 — o portal está de pé, mas o Supabase Storage não foi configurado. */
export function storageNotConfigured(
  message = "Armazenamento de arquivos não configurado. Avise o administrador do portal.",
  details?: string
) {
  return fail(503, message, details, API_ERROR_CODES.STORAGE_NOT_CONFIGURED);
}

export function serverError(message = "Erro interno ao processar a requisição.", details?: string) {
  return fail(500, message, details, API_ERROR_CODES.INTERNAL_ERROR);
}

/* -------------------------------------------------------------------------- */
/*  Utilitários                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Extrai a mensagem de um `unknown` capturado em catch.
 *
 * Nunca devolve stack trace: a connection string do Supabase aparece em erros do
 * Prisma, e esse texto pode acabar em `details` no navegador.
 */
export function errorMessage(error: unknown, fallback = "Erro desconhecido."): string {
  if (error instanceof Error) return redactSecrets(error.message);
  if (typeof error === "string") return redactSecrets(error);
  return fallback;
}

/**
 * Remove segredos de um texto antes de ele sair do servidor.
 *
 * Cobre o caso concreto que mais assusta: erros de conexão do Prisma trazem a
 * URL `postgresql://usuario:senha@host` inteira na mensagem.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://***REDACTED***")
    .replace(/(service_role|apikey|api[-_]?key|authorization|bearer)\s*[:=]\s*\S+/gi, "$1=***REDACTED***")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "***JWT-REDACTED***");
}
