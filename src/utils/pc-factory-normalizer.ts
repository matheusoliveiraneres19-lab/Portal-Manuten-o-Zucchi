/**
 * Funções puras de classificação do "Nome Status Recurso" do PC-Factory.
 * Sem dependência de Prisma ou React — testáveis isoladamente.
 *
 * REGRA DE NEGÓCIO CENTRAL (manutenção) — ALINHADA À MANAGEMENT VIEW DO PC-FACTORY
 * (decisão do gestor em 2026-06-24): entram como manutenção os SEIS status do grupo
 * "Manutenção" do PC-Factory (códigos RCODSTATUS 02xx). A comparação continua por
 * valor EXATO normalizado — NUNCA por `contains("Manutenção")`:
 *   - Manutenção Mecânica    → tipo MECANICA   (0201)
 *   - Manutenção Elétrica    → tipo ELETRICA   (0202)
 *   - Manutenção Automação   → tipo AUTOMACAO  (0206)
 *   - Manutenção Planejada   → tipo PLANEJADA  (0207)
 *   - Manutenção de Terceiros→ tipo TERCEIROS  (0208)
 *   - Aguardando Manutenção  → tipo AGUARDANDO (0200)
 *
 * HISTÓRICO: até 2026-06-24 a regra contava SOMENTE 4 status (excluía Terceiros e
 * Planejada). Mudou para bater com a Tabela Gerencial do PC-Factory, que agrupa por
 * código RCODSTATUS. Ver classifyManagementGroup() e [[ref-pcfactory-grupos-gerenciais]].
 *
 * Casos especiais (não-manutenção):
 *   - "Falta de Utilidades" → grupo Materiais no PC-Factory (ver GROUP_BY_CODE).
 */
import { PcFactoryStatusCategory } from "@prisma/client";
import { PC_FACTORY_COLORS } from "@/constants/pc-factory-colors";

/* ------------------------------------------------------------------ */
/* Normalização de texto para comparação                              */
/* ------------------------------------------------------------------ */

/**
 * Normaliza o "Nome Status Recurso" para comparação:
 * remove espaços extras, trata acentos e caixa. NÃO altera o valor gravado em
 * statusRaw (esse é preservado na íntegra na importação).
 */
export function normalizePcFactoryStatusName(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Normaliza um CABEÇALHO de arquivo para busca no mapa de colunas: remove BOM
 * (o export CSV do PC-Factory vem em UTF-8 BOM), acentos, espaços e qualquer
 * caractere não alfanumérico, e baixa a caixa. Diferente de `normalizarNomeColuna`,
 * que preserva separadores como "_" — aqui o resultado é sempre uma palavra só.
 *
 *   "﻿resourceName"         → "resourcename"
 *   "resourceName"               → "resourcename"
 *   "durationHours"              → "durationhours"
 *   "classificationPcFactoryRef" → "classificationpcfactoryref"
 *   "Nome Status Recurso"        → "nomestatusrecurso"
 */
export function normalizeHeader(header: string): string {
  return String(header ?? "")
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

/**
 * Converte um número do PC-Factory para `number`, aceitando as duas convenções que
 * aparecem nos exports (TAREFA 6):
 *
 *   "8.3333"    → 8.3333     (CSV histórico: ponto é separador DECIMAL)
 *   "8,3333"    → 8.3333     (vírgula decimal)
 *   "1.234,56"  → 1234.56    (vírgula presente ⇒ pontos são milhar)
 *   "1.234.567" → 1234567    (vários pontos, sem vírgula ⇒ milhar)
 *   ""/null     → null
 *
 * REGRA: o ponto só é tratado como separador de MILHAR quando há uma vírgula no
 * texto (aí a vírgula é o decimal) ou quando há mais de um ponto. Um ponto isolado
 * é sempre DECIMAL. É essa a diferença crítica em relação a
 * `converterNumeroBrasileiro`, que remove todo ponto e transforma "8.3333" em
 * 83333 — o erro de mapeamento da coluna "Tempo Decorrido" citado no revert
 * dc793cf. Aquela função é compartilhada com Compras/Lubrificantes e por isso NÃO
 * foi alterada; este parser é exclusivo do PC-Factory.
 */
export function parsePcFactoryNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null) return null;

  const text = String(value)
    .replace(/ /g, " ")
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");
  if (!text) return null;

  const hasComma = text.includes(",");
  const dotCount = (text.match(/\./g) ?? []).length;

  const normalized = hasComma
    ? text.replace(/\./g, "").replace(",", ".") // vírgula decimal, pontos = milhar
    : dotCount > 1
      ? text.replace(/\./g, "") // vários pontos = milhar
      : text; // ponto isolado = decimal (ou nenhum ponto)

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/* ------------------------------------------------------------------ */
/* Chaves normalizadas dos status reais da planilha                   */
/* ------------------------------------------------------------------ */

const KEY = {
  MANUTENCAO_MECANICA: "manutencao mecanica",
  MANUTENCAO_ELETRICA: "manutencao eletrica",
  AGUARDANDO_MANUTENCAO: "aguardando manutencao",
  FORA_DE_TURNO: "fora de turno",
  RECURSO_NAO_PROGRAMADO: "recurso nao programado",
  PRODUCAO: "producao",
  SETUP: "setup",
  FALTA_DE_MATERIAL: "falta de material",
  PARADA_NAO_IDENTIFICADA: "parada nao identificada",
  REFEICAO: "refeicao",
  AGUARDANDO_LANCAMENTO: "aguardando lancamento",
  MANUTENCAO_AUTOMACAO: "manutencao automacao",
  MANUTENCAO_PLANEJADA: "manutencao planejada",
  MANUTENCAO_TERCEIROS: "manutencao de terceiros",
  FALTA_DE_UTILIDADES: "falta de utilidades"
} as const;

/**
 * Os SEIS status que contam como manutenção (grupo "Manutenção" do PC-Factory, 02xx).
 * Alinhado à Management View em 2026-06-24 (antes eram só 4 — sem Terceiros/Planejada).
 */
const MAINTENANCE_KEYS = new Set<string>([
  KEY.MANUTENCAO_MECANICA,
  KEY.MANUTENCAO_ELETRICA,
  KEY.MANUTENCAO_AUTOMACAO,
  KEY.MANUTENCAO_PLANEJADA,
  KEY.MANUTENCAO_TERCEIROS,
  KEY.AGUARDANDO_MANUTENCAO
]);

/**
 * Status que saem do Tempo Planejado / Tempo de Carga. "Aguardando lançamento" e
 * "Parada não Identificada" entram aqui por serem tempo NÃO APONTADO (apontamento
 * aberto e parada sem causa) — mantém `excludePlannedTime` coerente com
 * CATEGORY_BY_KEY e com o bucket NAO_APONTADO.
 */
const EXCLUDED_PLANNED_KEYS = new Set<string>([
  KEY.FORA_DE_TURNO,
  KEY.RECURSO_NAO_PROGRAMADO,
  KEY.AGUARDANDO_LANCAMENTO,
  KEY.PARADA_NAO_IDENTIFICADA
]);

/**
 * Status de parada/perda operacional (não-manutenção) para o cálculo.
 * "Parada não Identificada" saiu daqui em 2026-08-05: sem causa apontada, é tempo
 * NÃO MEDIDO (bucket NAO_APONTADO), não perda operacional atribuível.
 */
const OPERATIONAL_LOSS_KEYS = new Set<string>([KEY.SETUP, KEY.FALTA_DE_MATERIAL, KEY.FALTA_DE_UTILIDADES]);

/* ------------------------------------------------------------------ */
/* Classificação gerencial                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_BY_KEY: Record<string, PcFactoryStatusCategory> = {
  [KEY.MANUTENCAO_MECANICA]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.MANUTENCAO_ELETRICA]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.AGUARDANDO_MANUTENCAO]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.FORA_DE_TURNO]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.RECURSO_NAO_PROGRAMADO]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.PRODUCAO]: PcFactoryStatusCategory.PRODUCAO,
  [KEY.SETUP]: PcFactoryStatusCategory.SETUP,
  [KEY.FALTA_DE_MATERIAL]: PcFactoryStatusCategory.PARADA_PERDA,
  // Sem causa apontada → fora do Tempo Planejado, igual a Aguardando lançamento
  // (decisão de 2026-08-05). Mantém o card "Tempo planejado" igual ao Tempo de Carga.
  [KEY.PARADA_NAO_IDENTIFICADA]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.REFEICAO]: PcFactoryStatusCategory.OPERACIONAL,
  // "Aguardando lançamento" é apontamento ABERTO, não tempo medido: sai do Tempo
  // Planejado igual a Fora de Turno / Recurso Não Programado. Sem isso o card
  // "Tempo planejado" somaria as 90.688 h não apontadas de jan/2026 e divergiria do
  // Tempo de Carga oficial. Alinhado ao bucket NAO_APONTADO (decisão de 2026-08-05).
  // Ver também PARADA_NAO_IDENTIFICADA logo abaixo, pela mesma razão.
  [KEY.AGUARDANDO_LANCAMENTO]: PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  [KEY.MANUTENCAO_AUTOMACAO]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.MANUTENCAO_PLANEJADA]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.MANUTENCAO_TERCEIROS]: PcFactoryStatusCategory.MANUTENCAO,
  [KEY.FALTA_DE_UTILIDADES]: PcFactoryStatusCategory.PARADA_PERDA
};

/**
 * Classifica o "Nome Status Recurso" em categoria gerencial.
 * Status desconhecido → OUTROS. Todos os status de manutenção (02xx: Mecânica,
 * Elétrica, Automação, Planejada, Terceiros, Aguardando) entram em MANUTENCAO;
 * "Falta de Utilidades" entra em PARADA_PERDA.
 */
export function classifyPcFactoryStatus(statusRaw: unknown): PcFactoryStatusCategory {
  const key = normalizePcFactoryStatusName(statusRaw);
  const exact = CATEGORY_BY_KEY[key];
  if (exact) return exact;
  // O PC-Factory nomeia o grupo Setup por área ("Setup - Serrad", "Setup - Bifios"...),
  // então o match exato em "setup" nunca casava e 13,4 mil h caíam em OUTROS — deixando
  // o card de Setup zerado. O prefixo cobre as variações atuais e futuras.
  if (key.startsWith("setup")) return PcFactoryStatusCategory.SETUP;
  return PcFactoryStatusCategory.OUTROS;
}

/* ------------------------------------------------------------------ */
/* Funções booleanas (regras explícitas, por valor exato)            */
/* ------------------------------------------------------------------ */

/** true SOMENTE para Manutenção Mecânica, Elétrica, Automação e Aguardando Manutenção. */
export function isMaintenanceStatus(statusRaw: unknown): boolean {
  return MAINTENANCE_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

/** Alias semântico: os mesmos 4 status que entram no KPI de manutenção. */
export function isMaintenanceKpi(statusRaw: unknown): boolean {
  return isMaintenanceStatus(statusRaw);
}

export function isMechanicalMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.MANUTENCAO_MECANICA;
}

export function isElectricalMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.MANUTENCAO_ELETRICA;
}

export function isAutomationMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.MANUTENCAO_AUTOMACAO;
}

export function isWaitingMaintenance(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.AGUARDANDO_MANUTENCAO;
}

/** true para Fora de Turno e Recurso Não Programado (saem do tempo planejado). */
export function isExcludedFromPlannedTime(statusRaw: unknown): boolean {
  return EXCLUDED_PLANNED_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

/** true para Produção. */
export function isProductiveStatus(statusRaw: unknown): boolean {
  return normalizePcFactoryStatusName(statusRaw) === KEY.PRODUCAO;
}

/** true para Setup, Falta de Material, Parada não Identificada e Falta de Utilidades. */
export function isOperationalLossStatus(statusRaw: unknown): boolean {
  return OPERATIONAL_LOSS_KEYS.has(normalizePcFactoryStatusName(statusRaw));
}

/**
 * true quando o status paralisa a máquina e reduz a disponibilidade estimada:
 * manutenção (4 status), parada/perda (inclui Falta de Utilidades) e Setup.
 * Fora de Turno / Recurso Não Programado NÃO entram (saem do tempo planejado).
 */
export function isDowntimeForAvailability(statusRaw: unknown): boolean {
  const category = classifyPcFactoryStatus(statusRaw);
  return (
    category === PcFactoryStatusCategory.MANUTENCAO ||
    category === PcFactoryStatusCategory.PARADA_PERDA ||
    category === PcFactoryStatusCategory.SETUP
  );
}

/** Sub-tipo de manutenção do registro, ou null se não for manutenção. */
export type MaintenanceKind = "MECANICA" | "ELETRICA" | "AUTOMACAO" | "PLANEJADA" | "TERCEIROS" | "AGUARDANDO";

export function maintenanceKind(statusRaw: unknown): MaintenanceKind | null {
  const key = normalizePcFactoryStatusName(statusRaw);
  if (key === KEY.MANUTENCAO_MECANICA) return "MECANICA";
  if (key === KEY.MANUTENCAO_ELETRICA) return "ELETRICA";
  if (key === KEY.MANUTENCAO_AUTOMACAO) return "AUTOMACAO";
  if (key === KEY.MANUTENCAO_PLANEJADA) return "PLANEJADA";
  if (key === KEY.MANUTENCAO_TERCEIROS) return "TERCEIROS";
  if (key === KEY.AGUARDANDO_MANUTENCAO) return "AGUARDANDO";
  return null;
}

/** Rótulos por tipo de manutenção (UI e auditoria de importação). */
export const PC_FACTORY_MAINTENANCE_TYPE_LABELS: Record<MaintenanceKind, string> = {
  MECANICA: "Manutenção Mecânica",
  ELETRICA: "Manutenção Elétrica",
  AUTOMACAO: "Manutenção Automação",
  PLANEJADA: "Manutenção Planejada",
  TERCEIROS: "Manutenção de Terceiros",
  AGUARDANDO: "Aguardando Manutenção"
};

/* ------------------------------------------------------------------ */
/* Grupo gerencial do PC-Factory (Tabela Gerencial / Management View) */
/* ------------------------------------------------------------------ */

/**
 * Os 6 grupos da "Tabela Gerencial" do PC-Factory. A classificação oficial é por
 * CÓDIGO do status ("G0015.RCODSTATUS"), não pelo nome. Mapa confirmado pelo gestor
 * em 2026-06-24 (ver [[ref-pcfactory-grupos-gerenciais]]). NÃO é deriváveis do nome:
 * ex. "Aguardando Manutenção" (0200) é Manutenção, mas "Falta de Utilidades" (00070)
 * é Materiais e "Quebra de Ferramenta" (07020) é Operacional.
 */
export type PcFactoryManagementGroup =
  | "PADRAO_SISTEMA"
  | "SETUP"
  | "MANUTENCAO"
  | "OPERACIONAL"
  | "MATERIAIS"
  | "EXTERNO";

/** código RCODSTATUS (como vem na planilha) → grupo gerencial. */
const MANAGEMENT_GROUP_BY_CODE: Record<string, PcFactoryManagementGroup> = {
  // Padrão do Sistema (00xx)
  "0001": "PADRAO_SISTEMA", // Produção
  "0002": "PADRAO_SISTEMA", // Parada não Identificada
  "0004": "PADRAO_SISTEMA", // Fora de Turno
  "0008": "PADRAO_SISTEMA", // Aguardando lançamento
  "0009": "PADRAO_SISTEMA", // Recurso Não Programado
  // Manutenção (02xx)
  "0200": "MANUTENCAO", // Aguardando Manutenção
  "0201": "MANUTENCAO", // Mecânica
  "0202": "MANUTENCAO", // Elétrica
  "0206": "MANUTENCAO", // Automação
  "0207": "MANUTENCAO", // Planejada
  "0208": "MANUTENCAO", // de Terceiros
  // Operacional (03xx, 05xx + exceções confirmadas)
  "0301": "OPERACIONAL", // Acidente
  "0302": "OPERACIONAL", // Aguardando Carro Transportador
  "0303": "OPERACIONAL", // Ausência de Operador
  "0312": "OPERACIONAL", // Limpeza de Setor de Trabalho
  "0314": "OPERACIONAL", // Falta de Espaço para Movimentação
  "0319": "OPERACIONAL", // Quebra de Chapa
  "0320": "OPERACIONAL", // Refeição
  "0321": "OPERACIONAL", // Start Check List de Máquina
  "0323": "OPERACIONAL", // Inspeção de Qualidade
  "0326": "OPERACIONAL", // Resina Mole
  "0329": "OPERACIONAL", // Deslocamento de Operador
  "0502": "OPERACIONAL", // Reunião ou treinamento
  "0503": "OPERACIONAL", // Confraternizações
  "0612": "OPERACIONAL", // Revezamento (confirmado)
  "07020": "OPERACIONAL", // Quebra de Ferramenta (confirmado)
  // Materiais (04xx + Falta de Utilidades, confirmado)
  "0401": "MATERIAIS", // Falta de Material
  "0403": "MATERIAIS", // Falta de Carrinho p/ cargas
  "00070": "MATERIAIS", // Falta de Utilidades (confirmado)
  // Setup (06xxx + Medição de Abrasivos, confirmado)
  "06100": "SETUP", // Setup - PZs
  "06110": "SETUP", // Setup - Resina
  "06120": "SETUP", // Setup - Serrad
  "06130": "SETUP", // Setup - Tratam
  "06140": "SETUP", // Setup - Bifios
  "06150": "SETUP", // Setup - Envelop
  "0603": "SETUP" // Medição de Abrasivos (confirmado)
};

/** Fallback por NOME normalizado, para registros sem código (ex.: aba ajustada). */
const MANAGEMENT_GROUP_BY_NAME: Record<string, PcFactoryManagementGroup> = {
  [KEY.PRODUCAO]: "PADRAO_SISTEMA",
  [KEY.PARADA_NAO_IDENTIFICADA]: "PADRAO_SISTEMA",
  [KEY.FORA_DE_TURNO]: "PADRAO_SISTEMA",
  [KEY.AGUARDANDO_LANCAMENTO]: "PADRAO_SISTEMA",
  [KEY.RECURSO_NAO_PROGRAMADO]: "PADRAO_SISTEMA",
  [KEY.AGUARDANDO_MANUTENCAO]: "MANUTENCAO",
  [KEY.MANUTENCAO_MECANICA]: "MANUTENCAO",
  [KEY.MANUTENCAO_ELETRICA]: "MANUTENCAO",
  [KEY.MANUTENCAO_AUTOMACAO]: "MANUTENCAO",
  [KEY.MANUTENCAO_PLANEJADA]: "MANUTENCAO",
  [KEY.MANUTENCAO_TERCEIROS]: "MANUTENCAO",
  [KEY.SETUP]: "SETUP",
  [KEY.REFEICAO]: "OPERACIONAL",
  [KEY.FALTA_DE_MATERIAL]: "MATERIAIS",
  [KEY.FALTA_DE_UTILIDADES]: "MATERIAIS"
};

/**
 * Classifica o registro em um dos 6 grupos da Tabela Gerencial. Usa o CÓDIGO como
 * fonte primária; se desconhecido, tenta heurística por prefixo do código; por fim,
 * cai no nome do status. Default seguro: OPERACIONAL.
 */
export function classifyManagementGroup(statusCode: unknown, statusRaw?: unknown): PcFactoryManagementGroup {
  const code = String(statusCode ?? "").trim();
  if (code && MANAGEMENT_GROUP_BY_CODE[code]) return MANAGEMENT_GROUP_BY_CODE[code];

  // Heurística por prefixo, para códigos novos ainda não mapeados.
  if (code) {
    if (code.startsWith("061")) return "SETUP";
    if (code.startsWith("02")) return "MANUTENCAO";
    if (code.startsWith("04")) return "MATERIAIS";
    if (code.startsWith("03") || code.startsWith("05") || code.startsWith("07")) return "OPERACIONAL";
    if (code.startsWith("00")) return "PADRAO_SISTEMA";
  }

  const byName = MANAGEMENT_GROUP_BY_NAME[normalizePcFactoryStatusName(statusRaw)];
  return byName ?? "OPERACIONAL";
}

/* ------------------------------------------------------------------ */
/* Regra oficial de disponibilidade (TAREFAS 8 e 9)                    */
/* ------------------------------------------------------------------ */

/**
 * Bucket de disponibilidade — como cada registro entra na conta oficial:
 *
 *   FORA_DE_TURNO           fora do Tempo de Carga (turno não existe)
 *   RECURSO_NAO_PROGRAMADO  fora do Tempo de Carga (máquina não programada)
 *   NAO_APONTADO            fora do Tempo de Carga (tempo sem apontamento — ver abaixo)
 *   PARADA_PLANEJADA        dentro da Carga, sai do Tempo Operacional
 *   PARADA_NAO_PLANEJADA    dentro do Operacional, desconta do Tempo Trabalhado
 *   PRODUCAO                Tempo Trabalhado
 */
export type PcFactoryAvailabilityBucket =
  | "PRODUCAO"
  | "PARADA_PLANEJADA"
  | "PARADA_NAO_PLANEJADA"
  | "FORA_DE_TURNO"
  | "RECURSO_NAO_PROGRAMADO"
  | "NAO_APONTADO";

/**
 * Bucket por CÓDIGO do status (fonte primária — o código é estável, o nome varia
 * com acentuação e abreviação no export).
 *
 * Decisões de negócio embutidas aqui (gestor, 2026-08-05):
 *  - 0008 "Aguardando lançamento" → NAO_APONTADO, FORA do Tempo de Carga. São
 *    apontamentos abertos/não fechados, não parada medida: no CSV de jan–jul/2026 são
 *    145 linhas somando 90.688 h (≈625 h por linha). Tratá-las como parada não
 *    planejada derruba a disponibilidade para 28% e mede ausência de apontamento, não
 *    a máquina.
 *  - 0002 "Parada não Identificada" → NAO_APONTADO, também FORA do Tempo de Carga.
 *    São 21.129 h sem causa apontada (167 linhas só em janeiro, uma delas de 4.986 h).
 *    Descontá-las como parada não planejada media a falha de apontamento, não a
 *    máquina. Com as duas fora da carga a disponibilidade vai de 54,73% para ~70%,
 *    na direção dos ~85–91% que o commit 28a44f4 registra como aderentes ao
 *    PC-Factory real. O volume continua visível no painel de qualidade.
 *  - Grupo Setup (061xx) e 0603 → PARADA_PLANEJADA, confirmado ao vivo no Mapa/Andon
 *    do PC-Factory em 2026-08-04 (ver commit 84c32fc): "06120-Setup - Serrad" aparece
 *    com o mesmo painel laranja de "0320-Refeição", não com o vermelho de manutenção.
 */
const AVAILABILITY_BUCKET_BY_CODE: Record<string, PcFactoryAvailabilityBucket> = {
  // Padrão do sistema
  "0001": "PRODUCAO",
  "0002": "NAO_APONTADO", // Parada não Identificada — tempo sem causa apontada
  "0004": "FORA_DE_TURNO",
  "0008": "NAO_APONTADO", // Aguardando lançamento — apontamento aberto
  "0009": "RECURSO_NAO_PROGRAMADO",
  // Manutenção (02xx)
  "0200": "PARADA_NAO_PLANEJADA", // Aguardando Manutenção
  "0201": "PARADA_NAO_PLANEJADA", // Mecânica
  "0202": "PARADA_NAO_PLANEJADA", // Elétrica
  "0206": "PARADA_NAO_PLANEJADA", // Automação
  "0207": "PARADA_PLANEJADA", // Manutenção Planejada (Parada Planejada II na planilha)
  "0208": "PARADA_NAO_PLANEJADA", // de Terceiros
  // Operacional planejado
  "0312": "PARADA_PLANEJADA", // Limpeza de Setor de Trabalho
  "0320": "PARADA_PLANEJADA", // Refeição
  // Materiais / quebras — parada não planejada
  "0319": "PARADA_NAO_PLANEJADA", // Quebra de Chapa
  "0401": "PARADA_NAO_PLANEJADA", // Falta de Material
  "00070": "PARADA_NAO_PLANEJADA", // Falta de Utilidades
  "07020": "PARADA_NAO_PLANEJADA", // Quebra de Ferramenta - Serrad
  // Setup (confirmado ao vivo — parada PLANEJADA)
  "06100": "PARADA_PLANEJADA",
  "06110": "PARADA_PLANEJADA",
  "06120": "PARADA_PLANEJADA",
  "06130": "PARADA_PLANEJADA",
  "06140": "PARADA_PLANEJADA",
  "06150": "PARADA_PLANEJADA",
  "0603": "PARADA_PLANEJADA" // Medição de Abrasivos (grupo Setup)
};

/** Bucket por NOME normalizado — usado quando o código não está mapeado. */
const AVAILABILITY_BUCKET_BY_NAME: Record<string, PcFactoryAvailabilityBucket> = {
  [KEY.PRODUCAO]: "PRODUCAO",
  [KEY.FORA_DE_TURNO]: "FORA_DE_TURNO",
  [KEY.RECURSO_NAO_PROGRAMADO]: "RECURSO_NAO_PROGRAMADO",
  [KEY.AGUARDANDO_LANCAMENTO]: "NAO_APONTADO",
  [KEY.REFEICAO]: "PARADA_PLANEJADA",
  "limpeza de setor de trabalho": "PARADA_PLANEJADA",
  [KEY.MANUTENCAO_MECANICA]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_ELETRICA]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_AUTOMACAO]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_TERCEIROS]: "PARADA_NAO_PLANEJADA",
  [KEY.AGUARDANDO_MANUTENCAO]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_PLANEJADA]: "PARADA_PLANEJADA",
  [KEY.FALTA_DE_MATERIAL]: "PARADA_NAO_PLANEJADA",
  [KEY.FALTA_DE_UTILIDADES]: "PARADA_NAO_PLANEJADA",
  [KEY.PARADA_NAO_IDENTIFICADA]: "NAO_APONTADO",
  "quebra de ferramenta": "PARADA_NAO_PLANEJADA",
  "quebra de chapa": "PARADA_NAO_PLANEJADA"
};

/** `classificationPcFactoryRef` da planilha → bucket (última prioridade). */
const AVAILABILITY_BUCKET_BY_REF: Record<string, PcFactoryAvailabilityBucket> = {
  producao: "PRODUCAO",
  "parada planejada i": "PARADA_PLANEJADA",
  "parada planejada ii": "PARADA_PLANEJADA",
  "parada nao planejada": "PARADA_NAO_PLANEJADA",
  "tempo fora de turno": "FORA_DE_TURNO"
};

/**
 * Classifica um registro no bucket oficial de disponibilidade (TAREFA 8).
 *
 * PRIORIDADE: 1) statusCode · 2) status (nome) · 3) classificationPcFactoryRef.
 *
 * A ordem importa: a planilha traz "Recurso Não Programado" com
 * `classificationPcFactoryRef = "Parada Planejada I"`, mas ele precisa ficar FORA do
 * Tempo de Carga. Como o código (0009) e o nome vêm antes da ref, a regra por
 * status/statusCode prevalece — conforme exigido.
 *
 * Default quando nada casa: PARADA_NAO_PLANEJADA (conservador — um status novo
 * aparece descontando a disponibilidade em vez de sumir silenciosamente da conta).
 */
export function classifyAvailabilityBucket(record: {
  statusCode?: unknown;
  statusRaw?: unknown;
  classificationRef?: unknown;
}): PcFactoryAvailabilityBucket {
  const code = String(record.statusCode ?? "").trim();
  if (code && AVAILABILITY_BUCKET_BY_CODE[code]) return AVAILABILITY_BUCKET_BY_CODE[code];

  const name = normalizePcFactoryStatusName(record.statusRaw);
  if (name) {
    const byName = AVAILABILITY_BUCKET_BY_NAME[name];
    if (byName) return byName;
    // Prefixos: "Setup - Serrad", "Quebra de Ferramenta - Serrad" etc.
    if (name.startsWith("setup")) return "PARADA_PLANEJADA";
    if (name.startsWith("quebra de ferramenta")) return "PARADA_NAO_PLANEJADA";
  }

  // Heurística por prefixo de código, para códigos novos ainda não mapeados.
  if (code.startsWith("061")) return "PARADA_PLANEJADA";

  const ref = normalizePcFactoryStatusName(record.classificationRef);
  if (ref && AVAILABILITY_BUCKET_BY_REF[ref]) return AVAILABILITY_BUCKET_BY_REF[ref];

  return "PARADA_NAO_PLANEJADA";
}

/** Buckets que ficam FORA do Tempo de Carga. */
export const OUT_OF_LOAD_BUCKETS: ReadonlySet<PcFactoryAvailabilityBucket> = new Set<PcFactoryAvailabilityBucket>([
  "FORA_DE_TURNO",
  "RECURSO_NAO_PROGRAMADO",
  "NAO_APONTADO"
]);

/** Decomposição das horas do recorte (base do Tempo Operacional), em horas. */
export type PcFactoryAvailabilityBreakdown = {
  /** Soma de TODAS as horas do recorte, antes de qualquer exclusão. */
  totalHours: number;
  outOfShiftHours: number;
  unscheduledResourceHours: number;
  /** Tempo sem apontamento (0008) — fora da carga, mas rastreado como qualidade. */
  notReportedHours: number;
  /** Tempo de Carga = total − fora de turno − não programado − não apontado. */
  loadHours: number;
  plannedStopHours: number;
  /** Tempo Operacional = Carga − Paradas Planejadas. Denominador da disponibilidade. */
  operationalHours: number;
  unplannedStopHours: number;
  /** Tempo Trabalhado = Operacional − Paradas Não Planejadas. */
  workedHours: number;
  /**
   * Trabalhado / Operacional × 100 — esta é a **UTILIZAÇÃO**, NÃO a Disponibilidade.
   *
   * O PC-Factory expõe as duas métricas separadamente (G0007, aba Indicadores). A
   * Disponibilidade oficial do portal segue a planilha G0134 e desconta apenas as horas
   * de MANUTENÇÃO sobre o Tempo Operacional — ver `calculateG0134BusinessAvailability`.
   * Mantido para leitura/auditoria: NÃO alimenta nenhum card, tabela ou gráfico rotulado
   * como "Disponibilidade".
   */
  utilizationPercent: number | null;
};

/**
 * Decompõe as horas do recorte por bucket até o Tempo Operacional — que é o
 * equivalente, derivado do histórico de status, da coluna `G0134.LOADTIME` da planilha
 * oficial. Fonte ÚNICA dessa decomposição; não duplicar esta conta.
 *
 * Este CSV histórico não traz a coluna G0134.LOADTIME, então o Tempo de Carga é
 * derivado dos próprios registros de status.
 *
 * NÃO calcula a Disponibilidade: quem faz isso é
 * `calculateG0134BusinessAvailability`, que consome o `operationalHours` daqui. O
 * `utilizationPercent` devolvido é a métrica de Utilização (ver o tipo acima).
 *
 * Nunca devolve NaN, Infinity ou -Infinity: sem Tempo Operacional (≤ 0) o retorno é
 * `utilizationPercent = null`, e a UI mostra "—".
 */
export function calculateOfficialPcFactoryAvailability(hoursByBucket: {
  production: number;
  plannedStop: number;
  unplannedStop: number;
  outOfShift: number;
  unscheduledResource: number;
  notReported: number;
}): PcFactoryAvailabilityBreakdown {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const production = safe(hoursByBucket.production);
  const plannedStopHours = safe(hoursByBucket.plannedStop);
  const unplannedStopHours = safe(hoursByBucket.unplannedStop);
  const outOfShiftHours = safe(hoursByBucket.outOfShift);
  const unscheduledResourceHours = safe(hoursByBucket.unscheduledResource);
  const notReportedHours = safe(hoursByBucket.notReported);

  const totalHours =
    production + plannedStopHours + unplannedStopHours + outOfShiftHours + unscheduledResourceHours + notReportedHours;
  const loadHours = totalHours - outOfShiftHours - unscheduledResourceHours - notReportedHours;
  const operationalHours = loadHours - plannedStopHours;
  const workedHours = operationalHours - unplannedStopHours;

  const utilizationPercent =
    operationalHours > 0 ? Math.round(Math.max(0, Math.min(100, (workedHours / operationalHours) * 100)) * 100) / 100 : null;

  return {
    totalHours: round(totalHours),
    outOfShiftHours: round(outOfShiftHours),
    unscheduledResourceHours: round(unscheduledResourceHours),
    notReportedHours: round(notReportedHours),
    loadHours: round(loadHours),
    plannedStopHours: round(plannedStopHours),
    operationalHours: round(operationalHours),
    unplannedStopHours: round(unplannedStopHours),
    workedHours: round(workedHours),
    utilizationPercent
  };
}

/**
 * DISPONIBILIDADE OFICIAL DO PORTAL — regra da planilha do negócio
 * `disponibilidade mensal exportado.xlsx` (aba `ag-grid`), que replica o relatório nativo
 * **G0134 — Indicadores de Manutenção OEE** do PC-Factory.
 *
 * Fórmulas das próprias células da planilha (linha 2):
 *
 *     L = D + E              → Tempo de Manutenção + Tempo Ag. Manutenção
 *     M = L / C              → ÷ G0134.LOADTIME
 *     N = M * 100
 *     O = 100 - N            → Disponibilidade
 *
 * Equivalente a:
 *
 *     Disponibilidade = (LOADTIME − (Manutenção + Ag. Manutenção)) / LOADTIME × 100
 *
 * No portal, lendo o histórico de status:
 *   `operationalHours`  = Tempo de Carga − Paradas Planejadas  (= G0134.LOADTIME)
 *   `maintenanceHours`  = horas de manutenção DENTRO do Tempo Operacional (Mecânica +
 *                         Elétrica + Automação + Terceiros + Aguardando Manutenção)
 *
 * NÃO confundir com duas métricas parecidas:
 *  - **Utilização** (Trabalhado ÷ Operacional): desconta TODAS as paradas não planejadas,
 *    não só manutenção. É o `utilizationPercent` acima.
 *  - **DTM [%]** nativo do G0134: desconta só Tempo de Manutenção, SEM o Aguardando
 *    Manutenção. Na planilha a linha 1 mostra DTM 96,44% contra Disponibilidade 94,83%.
 *
 * Nunca devolve NaN/Infinity: sem Tempo Operacional (≤ 0) devolve null e a UI mostra "—".
 * O resultado é limitado a [0, 100].
 */
export function calculateG0134BusinessAvailability(params: {
  operationalHours: number;
  maintenanceHours: number;
}): number | null {
  const safeNumber = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const operational = safeNumber(params.operationalHours);
  const maintenance = safeNumber(params.maintenanceHours);

  if (operational <= 0) return null;

  const availability = ((operational - maintenance) / operational) * 100;
  return Math.round(Math.max(0, Math.min(100, availability)) * 100) / 100;
}

/** Rótulos dos grupos gerenciais (idênticos à tela do PC-Factory). */
export const PC_FACTORY_MANAGEMENT_GROUP_LABELS: Record<PcFactoryManagementGroup, string> = {
  PADRAO_SISTEMA: "Padrão do Sistema",
  SETUP: "Setup",
  MANUTENCAO: "Manutenção",
  OPERACIONAL: "Operacional",
  MATERIAIS: "Materiais",
  EXTERNO: "Externo"
};

/** Ordem de exibição (maior para menor, como na Tabela Gerencial). */
export const PC_FACTORY_MANAGEMENT_GROUP_ORDER: PcFactoryManagementGroup[] = [
  "PADRAO_SISTEMA",
  "SETUP",
  "MANUTENCAO",
  "OPERACIONAL",
  "MATERIAIS",
  "EXTERNO"
];

/* ------------------------------------------------------------------ */
/* Rótulos e cores das categorias (UI premium)                        */
/* ------------------------------------------------------------------ */

export const PC_FACTORY_CATEGORY_LABELS: Record<PcFactoryStatusCategory, string> = {
  MANUTENCAO: "Manutenção",
  PRODUCAO: "Produção",
  SETUP: "Setup",
  PARADA_PERDA: "Parada/perda",
  OPERACIONAL: "Operacional",
  EXCLUIR_TEMPO_PLANEJADO: "Fora do tempo planejado",
  OUTROS: "Outros"
};

export const PC_FACTORY_CATEGORY_COLORS: Record<PcFactoryStatusCategory, string> = {
  MANUTENCAO: PC_FACTORY_COLORS.MANUTENCAO,
  PRODUCAO: PC_FACTORY_COLORS.PRODUCAO,
  SETUP: PC_FACTORY_COLORS.SETUP,
  PARADA_PERDA: PC_FACTORY_COLORS.PARADA_PERDA,
  OPERACIONAL: PC_FACTORY_COLORS.OPERACIONAL,
  EXCLUIR_TEMPO_PLANEJADO: PC_FACTORY_COLORS.FORA_PLANEJADO,
  OUTROS: PC_FACTORY_COLORS.OUTROS
};

export const PC_FACTORY_CATEGORY_ORDER: PcFactoryStatusCategory[] = [
  PcFactoryStatusCategory.PRODUCAO,
  PcFactoryStatusCategory.MANUTENCAO,
  PcFactoryStatusCategory.SETUP,
  PcFactoryStatusCategory.PARADA_PERDA,
  PcFactoryStatusCategory.OPERACIONAL,
  PcFactoryStatusCategory.EXCLUIR_TEMPO_PLANEJADO,
  PcFactoryStatusCategory.OUTROS
];

/* ------------------------------------------------------------------ */
/* Chave canônica do status real + cor por status (data-driven)        */
/* ------------------------------------------------------------------ */

/**
 * CHAVE canônica do status REAL da planilha (statusKey), estável p/ agrupar e colorir:
 * remove acentos, CAIXA ALTA, colapsa espaços e troca qualquer caractere não alfanumérico
 * por "_". NÃO altera o nome original (statusRaw é preservado na íntegra).
 * Ex.: "Produção" → "PRODUCAO"; "Manutenção Mecânica" → "MANUTENCAO_MECANICA";
 *      "Setup - Serrad" → "SETUP_SERRAD"; "Recurso Não Programado" → "RECURSO_NAO_PROGRAMADO".
 */
export function normalizePcFactoryStatusKey(status: unknown): string {
  return String(status ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Converte uma cor vinda do Excel para "#RRGGBB", ou null se não der.
 * Aceita: ARGB ("FFFF0000"), RGB ("FF0000"), hex com "#" ("#7030A0"), atalho de 3
 * dígitos ("abc") e objetos do exceljs ({ argb }/{ rgb }). Theme/indexed não resolvem
 * aqui (dependeriam da paleta do tema) → null, caindo no fallback. Nunca lança.
 */
export function normalizeExcelColorToHex(color: unknown): string | null {
  if (color === null || color === undefined) return null;
  let raw: string | null = null;
  if (typeof color === "string") {
    raw = color;
  } else if (typeof color === "object") {
    const c = color as { argb?: unknown; rgb?: unknown; hex?: unknown };
    raw =
      (typeof c.argb === "string" && c.argb) ||
      (typeof c.rgb === "string" && c.rgb) ||
      (typeof c.hex === "string" && c.hex) ||
      null;
  }
  if (!raw) return null;

  let hex = raw.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]+$/.test(hex)) return null;
  if (hex.length === 8) {
    // ARGB → se totalmente transparente, trata como "sem cor"; senão descarta o alpha.
    if (hex.slice(0, 2) === "00") return null;
    hex = hex.slice(2);
  }
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (hex.length !== 6) return null;
  return `#${hex}`;
}

/**
 * Fallback de cor por statusKey — usado SOMENTE quando a planilha não trouxe cor
 * (nem coluna de cor, nem preenchimento de célula) e o banco não tem cor salva.
 * Não é a fonte primária: a prioridade é planilha/banco → fallback → cinza neutro.
 */
export const PC_FACTORY_STATUS_COLOR_FALLBACK: Record<string, string> = {
  PRODUCAO: "#39FF14",
  FORA_DE_TURNO: "#7F1D1D",
  RECURSO_NAO_PROGRAMADO: "#303300",
  MANUTENCAO_MECANICA: "#FF1F1A",
  MANUTENCAO_ELETRICA: "#7030A0",
  MANUTENCAO_AUTOMACAO: "#7B2CBF",
  AGUARDANDO_MANUTENCAO: "#FFFF00",
  AGUARDANDO_LANCAMENTO: "#FF6A1A",
  FALTA_DE_UTILIDADES: "#F39A6B",
  SETUP: "#2F73BD",
  REFEICAO: "#F4D2B2",
  FALTA_DE_MATERIAL: "#FFC928",
  PARADA_NAO_IDENTIFICADA: "#FF6A1A",
  OUTROS: "#9CA3AF"
};

const NEUTRAL_STATUS_COLOR = "#9CA3AF";

export type PcFactoryStatusColorSource = "planilha" | "fallback" | "neutro";

/**
 * Resolve a cor final de um status para o gráfico, com a prioridade do projeto:
 * 1) cor lida da planilha e salva no banco (statusColorHex); 2) fallback por statusKey
 * (com match por prefixo, ex. SETUP_SERRAD → SETUP); 3) cinza neutro. Nunca lança.
 */
export function resolvePcFactoryStatusColor(
  statusKey: string,
  storedHex?: string | null
): { hex: string; source: PcFactoryStatusColorSource } {
  const stored = normalizeExcelColorToHex(storedHex);
  if (stored) return { hex: stored, source: "planilha" };

  if (PC_FACTORY_STATUS_COLOR_FALLBACK[statusKey]) {
    return { hex: PC_FACTORY_STATUS_COLOR_FALLBACK[statusKey], source: "fallback" };
  }
  const prefix = statusKey.split("_")[0];
  if (prefix && PC_FACTORY_STATUS_COLOR_FALLBACK[prefix]) {
    return { hex: PC_FACTORY_STATUS_COLOR_FALLBACK[prefix], source: "fallback" };
  }
  return { hex: NEUTRAL_STATUS_COLOR, source: "neutro" };
}

/* ------------------------------------------------------------------ */
/* Datas e duração (inalterado — conversões da planilha)              */
/* ------------------------------------------------------------------ */

import { converterDataExcel, converterNumeroBrasileiro, limparTexto } from "@/utils/importacao";

/** Converte data/hora da planilha (serial Excel, dd/mm/aaaa hh:mm, ISO, Date). */
/**
 * Ano mínimo aceito. O PC-Factory exporta "01/01/0001 00:00:00" como sentinela de
 * "sem data" — tipicamente no `endDateTime` de status ainda abertos (ex.: "Aguardando
 * lançamento"). Sem essa trava o valor NÃO cai em NaN: `Date.UTC(1, …)` entra na regra
 * de ano 0–99 do JavaScript e vira 1901-01-01, uma data válida que contamina o período
 * detectado e os filtros. Ver TAREFA 5.
 */
const MIN_VALID_YEAR = 2000;

/** Descarta datas-sentinela (01/01/0001) e qualquer ano anterior a 2000 → null. */
function rejectSentinelDate(date: Date | null): Date | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear() < MIN_VALID_YEAR ? null : date;
}

export function parsePcFactoryDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return rejectSentinelDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return rejectSentinelDate(converterDataExcel(value));
  }

  const text = limparTexto(value);
  if (!text) {
    return null;
  }

  // dd/mm/yyyy [HH:mm[:ss]]
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const hours = Number(br[4] ?? 0);
    const minutes = Number(br[5] ?? 0);
    const seconds = Number(br[6] ?? 0);
    // Trava ANTES de montar a data: Date.UTC(1, …) devolveria 1901, não NaN.
    if (year < MIN_VALID_YEAR) return null;
    const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // yyyy-mm-dd[THH:mm[:ss]] — ISO sem fuso, lido como UTC para não deslocar o dia.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const year = Number(iso[1]);
    if (year < MIN_VALID_YEAR) return null;
    const date = new Date(
      Date.UTC(year, Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0))
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return rejectSentinelDate(converterDataExcel(text));
}

/** Combina uma data (Date) com um horário textual ("HH:MM"/"HH:MM:SS" ou fração Excel). */
export function combineDateAndTime(date: Date | null, timeValue: unknown): Date | null {
  if (!date) return null;
  if (timeValue === undefined || timeValue === null || timeValue === "") return date;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (typeof timeValue === "number" && Number.isFinite(timeValue)) {
    const fraction = timeValue >= 1 ? timeValue - Math.floor(timeValue) : timeValue;
    const total = Math.round(fraction * 24 * 60 * 60);
    hours = Math.floor(total / 3600) % 24;
    minutes = Math.floor((total % 3600) / 60);
    seconds = total % 60;
  } else {
    const match = limparTexto(timeValue).match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
    if (!match) return date;
    hours = Number(match[1]);
    minutes = Number(match[2]);
    seconds = Number(match[3] ?? 0);
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, seconds)
  );
}

/** Converte a duração para minutos (número em minutos, fração do dia Excel, hh:mm, "1,5h", "90 min"). */
export function parseDurationToMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1) {
      return round(value * 24 * 60);
    }
    return round(value);
  }

  const text = limparTexto(value).toLowerCase();
  if (!text) {
    return null;
  }

  const clock = text.match(/^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    return round(Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60);
  }

  const hoursMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas|hr|hrs)$/);
  if (hoursMatch) {
    const hours = converterNumeroBrasileiro(hoursMatch[1]);
    return hours === null ? null : round(hours * 60);
  }

  const minutesMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|minuto|minutos)$/);
  if (minutesMatch) {
    return converterNumeroBrasileiro(minutesMatch[1]);
  }

  return converterNumeroBrasileiro(text);
}

/**
 * Converte a coluna "Tempo Decorrido [hr]" da aba bruta `ag-grid` para minutos.
 * Nessa aba o valor chega como FRAÇÃO DE DIA (ex.: 0,347 ≈ 8,33 h), não como horas.
 * Regra de negócio: se o valor for < 1.5, multiplicar por 24 (fração de dia → horas);
 * caso contrário, assume-se que já está em horas. Retorna minutos.
 */
export function parseAgGridElapsedToMinutes(value: unknown): number | null {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : converterNumeroBrasileiro(limparTexto(value));
  if (raw === null || !Number.isFinite(raw) || raw < 0) return null;
  const hours = raw < 1.5 ? raw * 24 : raw;
  return round(hours * 60);
}

/** Calcula a duração em minutos a partir do delta início→fim, com fallback no valor da coluna. */
export function computeDurationMinutes(start: Date | null, end: Date | null, fallback: number | null): number {
  if (start && end) {
    const deltaMs = end.getTime() - start.getTime();
    if (deltaMs > 0) {
      return round(deltaMs / 60000);
    }
  }
  return fallback !== null && fallback >= 0 ? round(fallback) : 0;
}

export function normalizeResourceName(value: unknown): string {
  return limparTexto(value);
}

export function normalizeProductionLine(value: unknown): string | null {
  const text = limparTexto(value);
  return text || null;
}

/** Chave técnica para deduplicação na reimportação. */
export function buildPcFactoryTechnicalKey(parts: {
  resourceName: string;
  resourceCode: string | null;
  startDateTime: Date | null;
  statusRaw: string | null;
  durationMinutes: number;
  orderNumber: string | null;
}): string {
  return [
    parts.resourceCode || parts.resourceName,
    parts.startDateTime ? parts.startDateTime.toISOString() : "",
    normalizePcFactoryStatusName(parts.statusRaw),
    parts.durationMinutes,
    parts.orderNumber ?? ""
  ].join("|");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
