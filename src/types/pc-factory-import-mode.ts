/**
 * MODO DE APLICAÇÃO da importação do PC-Factory.
 *
 * Antes desta tarefa existia um modo só, implícito e destrutivo: toda
 * importação apagava a tabela inteira (`deleteMany({})`) e regravava o arquivo.
 * Importar setembro apagava janeiro a agosto. Agora:
 *
 *   INCREMENTAL     acrescenta ao histórico. NADA é apagado. Eventos que já
 *                   existem (mesma fingerprint) são pulados, então reimportar o
 *                   mesmo arquivo não duplica — só reporta "0 novos".
 *
 *   REPLACE_PERIOD  corrige um período: apaga SOMENTE os registros dentro da
 *                   janela do arquivo e insere os novos. Usado quando o mês foi
 *                   importado errado e o arquivo corrigido tem menos/outras
 *                   linhas — o que o INCREMENTAL sozinho não resolveria, porque
 *                   ele não remove o que sumiu do arquivo.
 *
 * Não existe modo "apagar tudo" na operação normal. O reset total continua
 * possível apenas pelo script de CLI explícito (`scripts/reset-pc-factory.ts`).
 */
export const PC_FACTORY_IMPORT_MODES = ["INCREMENTAL", "REPLACE_PERIOD"] as const;

export type PcFactoryImportMode = (typeof PC_FACTORY_IMPORT_MODES)[number];

/** Padrão da operação mensal: complementar o histórico. */
export const PC_FACTORY_DEFAULT_IMPORT_MODE: PcFactoryImportMode = "INCREMENTAL";

export function isPcFactoryImportMode(value: unknown): value is PcFactoryImportMode {
  return typeof value === "string" && (PC_FACTORY_IMPORT_MODES as readonly string[]).includes(value);
}

export const PC_FACTORY_IMPORT_MODE_LABELS: Record<PcFactoryImportMode, string> = {
  INCREMENTAL: "Adicionar ao histórico",
  REPLACE_PERIOD: "Substituir somente este período"
};

/**
 * O período REAL coberto pelo arquivo, medido em `startDateTime` — a mesma data
 * que o modo oficial (G0134) já usa para dizer a que mês um registro pertence.
 * A importação não reinterpreta nem fatia registro nenhum por causa disso.
 */
export type PcFactoryDetectedPeriod = {
  /** ISO do primeiro início encontrado. Null se nenhuma linha tem data. */
  start: string | null;
  /** ISO do último início encontrado. */
  end: string | null;
  /** Meses civis tocados ("2026-09"), em ordem. */
  months: string[];
  /**
   * true quando TODAS as linhas datadas caem em um único mês civil — o caso da
   * operação mensal, em que tratar o arquivo como "recorte daquele mês" é
   * seguro.
   */
  singleMonth: boolean;
  /** Linhas sem `startDateTime`: não pertencem a mês nenhum. */
  rowsWithoutDate: number;
};

/**
 * Prévia mostrada ANTES de aplicar. Nenhum número aqui vem de estimativa: são
 * contagens reais feitas contra o staging e contra a base.
 */
export type PcFactoryImportPreview = {
  period: PcFactoryDetectedPeriod;
  /** Linhas válidas no staging desta importação. */
  validRows: number;
  /** Destas, quantas ainda NÃO existem na base (fingerprint inédita). */
  newRecords: number;
  /** Destas, quantas já existem exatamente iguais (seriam puladas). */
  duplicateRecords: number;
  /**
   * Quantos registros a base JÁ tem dentro da janela de substituição. É o
   * número que dispara o alerta "já existem dados para este período" — e é
   * exatamente quantos o REPLACE_PERIOD removeria.
   */
  existingInPeriod: number;
  /**
   * A janela que o REPLACE_PERIOD apagaria: os MESES CIVIS inteiros que o
   * arquivo toca (ver `resolveReplacementWindow`), não o min/max das linhas.
   * ISO, ou null quando o arquivo não tem nenhuma linha datada.
   */
  replacementStart: string | null;
  replacementEnd: string | null;
  /** Modo sugerido: REPLACE_PERIOD quando o período já tem dados. */
  suggestedMode: PcFactoryImportMode;
  /**
   * true quando o arquivo cobre mais de um mês. Nesse caso REPLACE_PERIOD
   * apagaria TODOS esses meses — a tela precisa dizer isso com todas as letras
   * em vez de tratar a base acumulada como "só o último mês".
   */
  spansMultipleMonths: boolean;
};
