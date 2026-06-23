/**
 * Paleta central de cores do PC-Factory.
 *
 * FONTE ÚNICA DE VERDADE para a cor de cada status/classificação nos gráficos da
 * página `/dashboard/pc-factory`. Todos os gráficos devem derivar suas cores daqui
 * (direto pela constante ou via `getPcFactoryColor`) — nunca usar cor automática do
 * Recharts nem hardcode espalhado.
 *
 * Mudança puramente visual: não interfere em cálculo de horas, importação, filtros,
 * services de regra ou banco.
 */

export const PC_FACTORY_COLORS = {
  PRODUCAO: "#16A34A", // verde
  MANUTENCAO: "#DC2626", // vermelho
  MANUTENCAO_MECANICA: "#DC2626", // vermelho
  MANUTENCAO_ELETRICA: "#7C3AED", // roxo
  MANUTENCAO_AUTOMACAO: "#A78BFA", // roxo claro
  AGUARDANDO_MANUTENCAO: "#F59E0B", // amarelo
  FORA_PLANEJADO: "#7F1D1D", // vinho
  OPERACIONAL: "#2563EB", // azul
  SETUP: "#0F4D68", // azul-petróleo (status existente, não citado na demanda — mantido explícito)
  PARADA_PERDA: "#B91C1C", // vermelho escuro
  OUTROS: "#9CA3AF" // cinza neutro
} as const;

export type PcFactoryColorKey = keyof typeof PC_FACTORY_COLORS;

/**
 * Normaliza um texto de status/classificação para comparação:
 * remove acentos, ignora caixa, colapsa espaços e troca qualquer separador
 * (ex.: "/", "-", "×") por espaço único. Ex.: "Parada/perda" → "parada perda".
 */
function normalizeColorKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Variações textuais (vindas do banco/planilha/labels) → chave da paleta. */
const ALIASES: Record<string, PcFactoryColorKey> = {
  producao: "PRODUCAO",
  manutencao: "MANUTENCAO",
  "manutencao mecanica": "MANUTENCAO_MECANICA",
  mecanica: "MANUTENCAO_MECANICA",
  "manutencao eletrica": "MANUTENCAO_ELETRICA",
  eletrica: "MANUTENCAO_ELETRICA",
  "manutencao automacao": "MANUTENCAO_AUTOMACAO",
  automacao: "MANUTENCAO_AUTOMACAO",
  "aguardando manutencao": "AGUARDANDO_MANUTENCAO",
  aguardando: "AGUARDANDO_MANUTENCAO",
  "fora do tempo planejado": "FORA_PLANEJADO",
  "fora do planejado": "FORA_PLANEJADO",
  "fora de turno": "FORA_PLANEJADO",
  "excluir tempo planejado": "FORA_PLANEJADO",
  operacional: "OPERACIONAL",
  refeicao: "OPERACIONAL",
  setup: "SETUP",
  "parada perda": "PARADA_PERDA",
  parada: "PARADA_PERDA",
  perdas: "PARADA_PERDA",
  "parada nao identificada": "PARADA_PERDA",
  "falta de material": "PARADA_PERDA",
  "falta de utilidades": "PARADA_PERDA",
  outros: "OUTROS"
};

/**
 * Retorna a cor padronizada para um status/classificação do PC-Factory.
 * Aceita: chave da paleta (ex.: "MANUTENCAO_ELETRICA"), enum de categoria, ou texto
 * livre vindo do banco ("Manutenção Elétrica", "Fora do tempo planejado", "Parada/perda"…).
 * Tolera acentos, caixa e espaços. Status desconhecido → cinza neutro (OUTROS).
 */
export function getPcFactoryColor(key: string): string {
  if (!key) return PC_FACTORY_COLORS.OUTROS;

  // 1) match direto pela chave da paleta / enum (ex.: "MANUTENCAO", "PARADA_PERDA")
  const upper = key.trim().toUpperCase();
  if (upper in PC_FACTORY_COLORS) {
    return PC_FACTORY_COLORS[upper as PcFactoryColorKey];
  }

  // 2) match por alias textual normalizado
  const norm = normalizeColorKey(key);
  const alias = ALIASES[norm];
  if (alias) return PC_FACTORY_COLORS[alias];

  // 3) heurística por inclusão (subtipos antes do genérico "manutencao")
  if (norm.includes("mecanic")) return PC_FACTORY_COLORS.MANUTENCAO_MECANICA;
  if (norm.includes("eletric")) return PC_FACTORY_COLORS.MANUTENCAO_ELETRICA;
  if (norm.includes("automac")) return PC_FACTORY_COLORS.MANUTENCAO_AUTOMACAO;
  if (norm.includes("aguardando")) return PC_FACTORY_COLORS.AGUARDANDO_MANUTENCAO;
  if (norm.includes("setup")) return PC_FACTORY_COLORS.SETUP;
  if (norm.includes("operacional")) return PC_FACTORY_COLORS.OPERACIONAL;
  if (norm.includes("fora")) return PC_FACTORY_COLORS.FORA_PLANEJADO;
  if (norm.includes("manutencao")) return PC_FACTORY_COLORS.MANUTENCAO;
  if (norm.includes("producao")) return PC_FACTORY_COLORS.PRODUCAO;
  if (norm.includes("parada") || norm.includes("perda")) return PC_FACTORY_COLORS.PARADA_PERDA;

  return PC_FACTORY_COLORS.OUTROS;
}
