/**
 * FINGERPRINT do PC-Factory — identidade estável de um evento.
 *
 * SOMENTE SERVIDOR: usa `node:crypto`. Mora fora de `pc-factory-normalizer`
 * justamente por isso — aquele módulo é importado por Client Components
 * (rótulos de categoria na tela), e arrastar o crypto do Node para o bundle do
 * navegador quebraria a página.
 *
 * Depende só de `normalizePcFactoryStatusName`, que é puro.
 */
import { createHash } from "node:crypto";
import { normalizePcFactoryStatusName } from "@/utils/pc-factory-normalizer";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* FINGERPRINT — identidade estável de um evento do PC-Factory         */
/* ------------------------------------------------------------------ */

/**
 * Campos de NEGÓCIO que identificam um evento. Todos existem como colunas de
 * `PcFactoryRecord`, o que permite recomputar a fingerprint de um registro já
 * gravado (ver `scripts/backfill-pcfactory-fingerprint.ts`) — é isso que faz a
 * base histórica e as importações novas falarem a mesma língua.
 */
export type PcFactoryFingerprintInput = {
  resourceName: string;
  resourceCode: string | null;
  statusCode: string | null;
  statusRaw: string | null;
  startDateTime: Date | null;
  endDateTime: Date | null;
  durationMinutes: number;
  orderNumber: string | null;
  operationCode: string | null;
  /**
   * Ordinal da REPETIÇÃO desta mesma tupla de negócio dentro do arquivo (0 para a
   * primeira). NÃO é o número da linha do Excel: é quantas vezes a combinação
   * exata já apareceu. Mesmo arquivo reexportado com as linhas em outra ordem
   * produz o mesmo conjunto de fingerprints, porque as repetições são
   * indistinguíveis entre si por definição.
   *
   * Existe para não descartar eventos legítimos: duas linhas com máquina,
   * status, início, fim, duração, ordem e operação TODOS iguais só podem ser
   * contadas separadamente se a chave as distinguir.
   */
  occurrence?: number;
};

/**
 * FINGERPRINT determinística de um evento (SHA-1 hex, 40 caracteres).
 *
 * A mesma linha/evento produz a MESMA chave em qualquer importação futura —
 * é o que impede duplicar setembro ao reimportar setembro.
 *
 * O QUE ENTRA e por quê:
 *   máquina + status (código e nome) + início + fim + duração + ordem + operação
 *
 * O QUE NÃO ENTRA, deliberadamente:
 *   - **número da linha do Excel**: muda a cada reexportação e era exatamente o
 *     que fazia a chave antiga (`buildPcFactoryTechnicalKey` com `String(line)`)
 *     não reconhecer o mesmo evento vindo de um arquivo novo;
 *   - **nome do arquivo / lote**: reimportar o mesmo mês com outro nome de
 *     arquivo não pode criar registros novos;
 *   - **responsáveis, operador, observação, causa raiz**: são campos editáveis
 *     na origem. Se entrassem, corrigir o responsável no PC-Factory faria o
 *     evento reaparecer como se fosse outro.
 *
 * Nunca use máquina+duração nem máquina+status sozinhos como identidade: uma
 * máquina tem dezenas de paradas mecânicas de 30 min no mês, todas legítimas e
 * todas distintas — o que as separa é o INSTANTE (início e fim).
 */
export function buildPcFactoryRecordFingerprint(input: PcFactoryFingerprintInput): string {
  const payload = [
    // resourceCode quando existe (mais estável que o nome digitado); senão o nome.
    (input.resourceCode || input.resourceName || "").trim().toLowerCase(),
    (input.statusCode ?? "").trim(),
    normalizePcFactoryStatusName(input.statusRaw),
    input.startDateTime ? input.startDateTime.toISOString() : "",
    input.endDateTime ? input.endDateTime.toISOString() : "",
    // 2 casas: a duração é gravada arredondada, então o hash tem de usar o mesmo
    // arredondamento para o registro gravado e o registro relido baterem.
    round(input.durationMinutes).toFixed(2),
    (input.orderNumber ?? "").trim(),
    (input.operationCode ?? "").trim(),
    String(input.occurrence ?? 0)
  ].join("|");

  return createHash("sha1").update(payload, "utf8").digest("hex");
}

/**
 * Fingerprints de uma lista de eventos, resolvendo as repetições.
 *
 * Percorre na ordem recebida e incrementa `occurrence` toda vez que a mesma
 * tupla de negócio reaparece. Determinístico para um mesmo conjunto de eventos.
 */
export function buildPcFactoryFingerprints(inputs: PcFactoryFingerprintInput[]): string[] {
  const seen = new Map<string, number>();
  return inputs.map((input) => {
    // Chave-base sem o ordinal: é ela que conta as repetições.
    const base = buildPcFactoryRecordFingerprint({ ...input, occurrence: 0 });
    const previous = seen.get(base) ?? 0;
    seen.set(base, previous + 1);
    return previous === 0 ? base : buildPcFactoryRecordFingerprint({ ...input, occurrence: previous });
  });
}
