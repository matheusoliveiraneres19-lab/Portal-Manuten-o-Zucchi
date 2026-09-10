/**
 * Cliente Supabase ADMIN — EXCLUSIVAMENTE server-side.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ NUNCA importe este módulo de um Client Component ("use client"), de um    │
 * │ hook, ou de qualquer arquivo que o bundler mande para o navegador.        │
 * │ Ele lê a SERVICE ROLE KEY, que dá acesso TOTAL ao projeto Supabase        │
 * │ (ignora RLS, lê qualquer bucket, escreve em qualquer tabela).             │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Use apenas em Route Handlers (`src/app/api/**`), Server Components e services
 * chamados por eles. O guard `assertServerOnly()` abaixo derruba a chamada em
 * tempo de execução caso este módulo escape para o browser.
 *
 * NOMES DAS VARIÁVEIS
 * -------------------
 * O portal nasceu com `SUPABASE_URL`. O padrão do ecossistema Supabase é
 * `NEXT_PUBLIC_SUPABASE_URL`. Aceitamos as duas, com precedência para a que já
 * está configurada na Vercel (`SUPABASE_URL`), para que renomear a variável não
 * seja um deploy quebrado. `SUPABASE_SERVICE_ROLE_KEY` NÃO tem — e nunca pode
 * ter — variante `NEXT_PUBLIC_`: o prefixo faz o Next inlinar o valor no bundle
 * do cliente.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class SupabaseServerNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase server não configurado. Defina ${missing.join(" e ")} nas variáveis de ambiente ` +
        `(local em .env, produção em Vercel > Settings > Environment Variables).`
    );
    this.name = "SupabaseServerNotConfiguredError";
  }
}

/** URL do projeto Supabase. Pública por natureza — pode ir ao cliente. */
export function getSupabaseUrl(): string | null {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

/**
 * Chave anon/publishable. Pública por design (protegida por RLS). Só é
 * necessária no fluxo de upload direto navegador → Storage.
 */
export function getSupabaseAnonKey(): string | null {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    null
  );
}

function getServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/** true quando dá para criar o cliente admin (usado para responder 503 amigável). */
export function supabaseServerConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

/**
 * Barreira em tempo de execução: se este módulo for parar em um bundle de
 * cliente, a chamada falha alto em vez de tentar ler `process.env` (que no
 * browser seria `undefined`) e falhar de um jeito confuso.
 */
function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabase-server só pode ser usado no servidor. Importar este módulo em um " +
        "Client Component vazaria a SERVICE ROLE KEY para o navegador."
    );
  }
}

/**
 * Cria um cliente Supabase com a service role.
 *
 * Sem sessão e sem refresh de token: é uma chave de máquina, não um usuário —
 * persistir sessão só criaria estado desnecessário entre invocações serverless.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  assertServerOnly();

  const url = getSupabaseUrl();
  const serviceRole = getServiceRoleKey();

  if (!url || !serviceRole) {
    const missing: string[] = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!serviceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    throw new SupabaseServerNotConfiguredError(missing);
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

let cached: SupabaseClient | null = null;

/**
 * Versão memoizada de `createSupabaseAdminClient`. Preferir esta nos services:
 * em serverless o módulo é reaproveitado entre requisições da mesma instância,
 * então recriar o cliente a cada chamada é desperdício.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!cached) {
    cached = createSupabaseAdminClient();
  }
  return cached;
}
