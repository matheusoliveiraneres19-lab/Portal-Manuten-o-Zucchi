/**
 * Limitador de tentativas em memória, para frear força bruta no login.
 *
 * ESCOPO E LIMITAÇÃO (leia antes de confiar nisto como única defesa): o contador
 * vive na MEMÓRIA do processo. Na Vercel, cada instância serverless tem o seu, e
 * um cold start zera o estado — logo o limite real é "N tentativas por instância
 * ativa", não um teto global. Serve para cortar rajadas (o caso comum: script
 * batendo em sequência, que cai sempre na mesma instância quente) e para dar um
 * custo à varredura de logins, NÃO para um SLA de segurança.
 *
 * O freio criptográfico continua sendo o bcrypt(12) do `verifyPassword`. Se um
 * dia o portal precisar de um teto global, o caminho é mover estes contadores
 * para uma tabela (ou Redis) — a API abaixo não muda.
 */

type Bucket = {
  /** Timestamps (epoch ms) das falhas dentro da janela. */
  hits: number[];
};

const buckets = new Map<string, Bucket>();

/**
 * Teto de entradas no Map, para que um ataque com logins aleatórios não vire
 * consumo ilimitado de memória. Ao estourar, faz uma limpeza das janelas já
 * expiradas antes de recorrer ao descarte da entrada mais antiga.
 */
const MAX_TRACKED_KEYS = 5_000;

export type RateLimitRule = {
  /** Falhas permitidas dentro da janela antes de bloquear. */
  limit: number;
  /** Tamanho da janela em milissegundos. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Segundos até a janela liberar (0 quando permitido). */
  retryAfterSeconds: number;
};

/** Remove janelas já vencidas — chamado antes de crescer o Map. */
function evictExpired(now: number, windowMs: number): void {
  // `forEach` em vez de `for...of` no Map: o target do tsconfig não habilita
  // downlevelIteration, e deletar durante o forEach é seguro em JS.
  buckets.forEach((bucket: Bucket, key: string) => {
    const fresh = bucket.hits.filter((hit: number) => now - hit < windowMs);
    if (fresh.length === 0) {
      buckets.delete(key);
    } else {
      bucket.hits = fresh;
    }
  });
}

/**
 * Consulta o estado da chave SEM registrar tentativa. Use antes de validar a
 * senha: um pedido já bloqueado não deve nem pagar o custo do bcrypt.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const hits = bucket.hits.filter((hit) => now - hit < rule.windowMs);
  bucket.hits = hits;
  if (hits.length < rule.limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Libera quando a falha MAIS ANTIGA da janela vencer (janela deslizante).
  const oldest = Math.min(...hits);
  const retryAfterSeconds = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
  return { allowed: false, retryAfterSeconds };
}

/** Registra UMA falha na chave. Só falhas contam — sucesso chama `resetRateLimit`. */
export function registerFailure(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      evictExpired(now, rule.windowMs);
    }
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Ainda cheio de janelas vivas: descarta a entrada inserida há mais tempo
      // (Map preserva ordem de inserção) para manter o teto de memória.
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) {
        buckets.delete(oldestKey);
      }
    }
    buckets.set(key, { hits: [now] });
    return;
  }

  bucket.hits = bucket.hits.filter((hit) => now - hit < rule.windowMs);
  bucket.hits.push(now);
}

/** Zera a chave após uma autenticação bem-sucedida. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
