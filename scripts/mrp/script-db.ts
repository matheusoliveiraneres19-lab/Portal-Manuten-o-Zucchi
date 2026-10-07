/**
 * Conexão dos SCRIPTS da Análise MRP com o banco (não afeta a aplicação).
 *
 * Importar ANTES de qualquer módulo que use o Prisma. Ajusta só o processo do
 * script:
 *   - `connection_limit=1` (o pooler do Supabase já esgotou clientes antes);
 *   - `--direct`: usa a DIRECT_URL (:5432) no lugar da DATABASE_URL (:6543),
 *     útil quando o pooler :6543 está inacessível nesta rede.
 *
 * `connectWithRetry` tenta de novo SÓ a conexão inicial (SELECT 1), com número
 * finito de tentativas e backoff exponencial. Nunca repete transações.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv(): Record<string, string> {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

const env = loadDotEnv();
const useDirect = process.argv.includes("--direct");
const base = (useDirect ? process.env.DIRECT_URL || env.DIRECT_URL : process.env.DATABASE_URL || env.DATABASE_URL) ?? "";
if (base) {
  const url = /[?&]connection_limit=/.test(base) ? base : `${base}${base.includes("?") ? "&" : "?"}connection_limit=1`;
  process.env.DATABASE_URL = url;
}

export const SCRIPT_DB_MODE = useDirect ? "DIRECT_URL" : "DATABASE_URL";

const CONNECTION_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

export function isConnectionError(error: unknown): boolean {
  const e = error as { code?: string; errorCode?: string; name?: string; message?: string } | null;
  if (!e) return false;
  if (CONNECTION_CODES.has(e.code ?? "") || CONNECTION_CODES.has(e.errorCode ?? "")) return true;
  return e.name === "PrismaClientInitializationError" || /Can't reach database server|Timed out fetching a new connection/.test(e.message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tenta a conexão inicial até `attempts` vezes (backoff 1,5 s · 3 s · 6 s · 12 s…). */
export async function connectWithRetry(
  client: { $queryRawUnsafe: (q: string) => Promise<unknown> },
  options: { attempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<void> {
  const attempts = options.attempts ?? 5;
  const baseDelay = options.baseDelayMs ?? 1500;
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.$queryRawUnsafe("SELECT 1");
      if (i > 1) console.log(`[db] conectado na tentativa ${i}/${attempts}`);
      return;
    } catch (error) {
      if (!isConnectionError(error) || i === attempts) throw error;
      const wait = baseDelay * 2 ** (i - 1);
      console.warn(`[db] ${options.label ?? "conexão"}: banco inacessível (tentativa ${i}/${attempts}); nova tentativa em ${wait} ms`);
      await sleep(wait);
    }
  }
}

/**
 * Repete uma operação IDEMPOTENTE (leitura/contagem) em falha de conexão.
 * Não usar em escrita: uma escrita que caiu depois do commit não pode ser repetida às cegas.
 */
export async function readWithRetry<T>(fn: () => Promise<T>, options: { attempts?: number; baseDelayMs?: number; label?: string } = {}): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelay = options.baseDelayMs ?? 1500;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isConnectionError(error) || i >= attempts) throw error;
      const wait = baseDelay * 2 ** (i - 1);
      console.warn(`[db] ${options.label ?? "leitura"}: falha de conexão (tentativa ${i}/${attempts}); repetindo em ${wait} ms`);
      await sleep(wait);
    }
  }
}
