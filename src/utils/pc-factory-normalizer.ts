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

const EXCLUDED_PLANNED_KEYS = new Set<string>([KEY.FORA_DE_TURNO, KEY.RECURSO_NAO_PROGRAMADO]);

/** Status de parada/perda operacional (não-manutenção) para o cálculo. */
const OPERATIONAL_LOSS_KEYS = new Set<string>([
  KEY.SETUP,
  KEY.FALTA_DE_MATERIAL,
  KEY.PARADA_NAO_IDENTIFICADA,
  KEY.FALTA_DE_UTILIDADES
]);

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
  [KEY.PARADA_NAO_IDENTIFICADA]: PcFactoryStatusCategory.PARADA_PERDA,
  [KEY.REFEICAO]: PcFactoryStatusCategory.OPERACIONAL,
  [KEY.AGUARDANDO_LANCAMENTO]: PcFactoryStatusCategory.OUTROS,
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
  return CATEGORY_BY_KEY[key] ?? PcFactoryStatusCategory.OUTROS;
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
/* Classificação de DISPONIBILIDADE (regra oficial do PC-Factory)      */
/* ------------------------------------------------------------------ */

/**
 * As 4 classificações que a documentação do PC-Factory exige para QUALQUER status de
 * Recurso, para formar os indicadores de OEE/Disponibilidade (ver "Composição do Tempo -
 * Modelo Tradicional" e "Relação Status de Recurso e Indicadores de Desempenho" nos docs
 * do PC-Factory, e a legenda do Mapa/Andon: Operando / Parada Planejada 1 ou 2 /
 * Parada Não Planejada / Tempo Fora de Turno).
 *
 * Fórmula oficial (idêntica à tela "Indicadores OEE" / Mapa do PC-Factory):
 *   Tempo de Carga      = Tempo Total − Fora de Turno − Recurso Não Programado
 *   Tempo Operacional   = Tempo de Carga − Paradas Planejadas (I e II)
 *   Tempo Trabalhado    = Tempo Operacional − Paradas Não Planejadas
 *   Disponibilidade (%) = Tempo Trabalhado / Tempo Operacional × 100
 *
 * "Recurso Não Programado" fica FORA do Tempo de Carga (mesmo tratamento de Fora de
 * Turno) — mantém a mesma regra já usada em `EXCLUIR_TEMPO_PLANEJADO` no restante do
 * serviço; não é reclassificado aqui.
 */
export type PcFactoryAvailabilityBucket =
  | "FORA_DE_TURNO"
  | "RECURSO_NAO_PROGRAMADO"
  | "PRODUCAO"
  | "PARADA_PLANEJADA"
  | "PARADA_NAO_PLANEJADA";

/**
 * Mapa status → classificação de disponibilidade, por código RCODSTATUS (mesma fonte
 * confiável usada em MANAGEMENT_GROUP_BY_CODE). Baseado em:
 *   1) Confirmado AO VIVO no Mapa/Andon do PC-Factory em 2026-08-04: "0201-Manutenção
 *      Mecânica" e "0303-Ausência de Operador" aparecem como Parada Não Planejada
 *      (ícone vermelho) — não são inferência, foram observados na tela.
 *   2) Documentação oficial do PC-Factory ("Perdas na Produção"): paradas não
 *      planejadas = Operação (Setup, ajuste, pequenas paradas), Compras, Qualidade
 *      (aguardando/realizando inspeção), PCP, Movimentação de material, Manutenção
 *      corretiva. Paradas planejadas = Engenharia industrial, Ambiente/Saúde/Segurança
 *      (limpeza do posto, ginástica laboral), Manutenção preventiva, Marketing/Vendas,
 *      Educação programada (treinamentos).
 *
 * ⚠️ Itens marcados "(a confirmar)" foram classificados por analogia à documentação
 * oficial, mas NÃO foram observados ao vivo nem confirmados no cadastro F0024/F0029 do
 * PC-Factory (não fica acessível pela Management View web). Recomenda-se validar esses
 * itens com o administrador do PC-Factory e ajustar aqui se necessário.
 */
const AVAILABILITY_BUCKET_BY_CODE: Record<string, PcFactoryAvailabilityBucket> = {
  // Padrão do Sistema (00xx)
  "0001": "PRODUCAO", // Produção
  "0002": "PARADA_NAO_PLANEJADA", // Parada não Identificada (a confirmar — tratada como não planejada por padrão)
  "0004": "FORA_DE_TURNO", // Fora de Turno
  "0008": "PARADA_NAO_PLANEJADA", // Aguardando lançamento (a confirmar)
  "0009": "RECURSO_NAO_PROGRAMADO", // Recurso Não Programado
  // Manutenção (02xx) — só "Planejada" é parada planejada; o resto é corretiva/reativa
  "0200": "PARADA_NAO_PLANEJADA", // Aguardando Manutenção
  "0201": "PARADA_NAO_PLANEJADA", // Manutenção Mecânica — CONFIRMADO ao vivo (Mapa/Andon, 2026-08-04)
  "0202": "PARADA_NAO_PLANEJADA", // Manutenção Elétrica (mesma família de 0201)
  "0206": "PARADA_NAO_PLANEJADA", // Manutenção Automação (mesma família de 0201)
  "0207": "PARADA_PLANEJADA", // Manutenção Planejada (preventiva)
  "0208": "PARADA_NAO_PLANEJADA", // Manutenção de Terceiros (mesma família de 0201)
  // Operacional (03xx, 05xx + exceções confirmadas no grupo gerencial)
  "0301": "PARADA_NAO_PLANEJADA", // Acidente
  "0302": "PARADA_NAO_PLANEJADA", // Aguardando Carro Transportador (movimentação de material)
  "0303": "PARADA_NAO_PLANEJADA", // Ausência de Operador — CONFIRMADO ao vivo (Mapa/Andon, 2026-08-04)
  "0312": "PARADA_PLANEJADA", // Limpeza de Setor de Trabalho (Ambiente/Saúde/Segurança)
  "0314": "PARADA_NAO_PLANEJADA", // Falta de Espaço para Movimentação
  "0319": "PARADA_NAO_PLANEJADA", // Quebra de Chapa
  "0320": "PARADA_PLANEJADA", // Refeição (Ambiente/Saúde/Segurança)
  "0321": "PARADA_PLANEJADA", // Start Check List de Máquina (a confirmar)
  "0323": "PARADA_NAO_PLANEJADA", // Inspeção de Qualidade
  "0326": "PARADA_NAO_PLANEJADA", // Resina Mole
  "0329": "PARADA_NAO_PLANEJADA", // Deslocamento de Operador
  "0502": "PARADA_PLANEJADA", // Reunião ou treinamento (Educação programada)
  "0503": "PARADA_PLANEJADA", // Confraternizações (a confirmar)
  "0612": "PARADA_NAO_PLANEJADA", // Revezamento (a confirmar)
  "07020": "PARADA_NAO_PLANEJADA", // Quebra de Ferramenta
  // Materiais (04xx + Falta de Utilidades)
  "0401": "PARADA_NAO_PLANEJADA", // Falta de Material
  "0403": "PARADA_NAO_PLANEJADA", // Falta de Carrinho p/ cargas
  "00070": "PARADA_NAO_PLANEJADA", // Falta de Utilidades
  // Setup (06xxx + Medição de Abrasivos) — decisão de negócio confirmada: Setup é
  // parada operacional não planejada (ver SETUP_COUNTS_AS_LOSS no service).
  "06100": "PARADA_NAO_PLANEJADA", // Setup - PZs
  "06110": "PARADA_NAO_PLANEJADA", // Setup - Resina
  "06120": "PARADA_NAO_PLANEJADA", // Setup - Serrad
  "06130": "PARADA_NAO_PLANEJADA", // Setup - Tratam
  "06140": "PARADA_NAO_PLANEJADA", // Setup - Bifios
  "06150": "PARADA_NAO_PLANEJADA", // Setup - Envelop
  "0603": "PARADA_PLANEJADA" // Medição de Abrasivos (a confirmar)
};

/** Fallback por NOME normalizado, para registros sem código (ex.: aba ajustada). */
const AVAILABILITY_BUCKET_BY_NAME: Record<string, PcFactoryAvailabilityBucket> = {
  [KEY.PRODUCAO]: "PRODUCAO",
  [KEY.FORA_DE_TURNO]: "FORA_DE_TURNO",
  [KEY.RECURSO_NAO_PROGRAMADO]: "RECURSO_NAO_PROGRAMADO",
  [KEY.PARADA_NAO_IDENTIFICADA]: "PARADA_NAO_PLANEJADA",
  [KEY.AGUARDANDO_LANCAMENTO]: "PARADA_NAO_PLANEJADA",
  [KEY.AGUARDANDO_MANUTENCAO]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_MECANICA]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_ELETRICA]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_AUTOMACAO]: "PARADA_NAO_PLANEJADA",
  [KEY.MANUTENCAO_PLANEJADA]: "PARADA_PLANEJADA",
  [KEY.MANUTENCAO_TERCEIROS]: "PARADA_NAO_PLANEJADA",
  [KEY.SETUP]: "PARADA_NAO_PLANEJADA",
  [KEY.REFEICAO]: "PARADA_PLANEJADA",
  [KEY.FALTA_DE_MATERIAL]: "PARADA_NAO_PLANEJADA",
  [KEY.FALTA_DE_UTILIDADES]: "PARADA_NAO_PLANEJADA"
};

/**
 * Classifica o registro numa das 5 classificações de disponibilidade do PC-Factory.
 * Usa o CÓDIGO (RCODSTATUS) como fonte primária (igual a `classifyManagementGroup`);
 * cai no nome quando o código não é conhecido. Desconhecido → PARADA_NAO_PLANEJADA
 * (conservador: nunca infla a disponibilidade silenciosamente).
 */
export function classifyAvailabilityBucket(statusCode: unknown, statusRaw?: unknown): PcFactoryAvailabilityBucket {
  const code = String(statusCode ?? "").trim();
  if (code && AVAILABILITY_BUCKET_BY_CODE[code]) return AVAILABILITY_BUCKET_BY_CODE[code];

  const key = normalizePcFactoryStatusName(statusRaw);
  const byName = AVAILABILITY_BUCKET_BY_NAME[key];
  if (byName) return byName;

  // Heurística por prefixo para códigos novos ainda não mapeados.
  if (code) {
    if (code.startsWith("0004")) return "FORA_DE_TURNO";
    if (code.startsWith("0009")) return "RECURSO_NAO_PROGRAMADO";
    if (code === "0001") return "PRODUCAO";
    if (code === "0207") return "PARADA_PLANEJADA";
  }

  return "PARADA_NAO_PLANEJADA";
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
export function parsePcFactoryDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return converterDataExcel(value);
  }

  const text = limparTexto(value);
  if (!text) {
    return null;
  }

  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]) - 1;
    const year = Number(br[3].length === 2 ? `20${br[3]}` : br[3]);
    const hours = Number(br[4] ?? 0);
    const minutes = Number(br[5] ?? 0);
    const seconds = Number(br[6] ?? 0);
    const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return converterDataExcel(text);
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
