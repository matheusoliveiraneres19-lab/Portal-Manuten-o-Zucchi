import type { SettingCategory, SettingDefault, SettingValue } from "@/types/settings";

/**
 * Configurações padrão do portal — FONTE ÚNICA usada por:
 *  - seedDefaultSettings() (cria as linhas que ainda não existem, sem sobrescrever);
 *  - getSettingValue() como fallback quando a linha não existe no banco.
 *
 * Os valores aqui refletem as regras que já vigoram no código hoje, para que a
 * migração para "configurável" não altere nenhum comportamento até alguém editar.
 */
export const DEFAULT_SETTINGS: SettingDefault[] = [
  // ── Geral ─────────────────────────────────────────────────────────────
  { category: "geral", key: "nome_portal", label: "Nome do portal", value: "Portal de Gestão da Manutenção Zucchi", valueType: "text", description: "Nome exibido no portal." },
  { category: "geral", key: "empresa", label: "Empresa", value: "Zucchi", valueType: "text", description: "Razão/Nome da empresa." },
  { category: "geral", key: "versao", label: "Versão do portal", value: "V.01", valueType: "text", isEditable: false, description: "Versão atual do sistema." },

  // ── Metas dos indicadores ─────────────────────────────────────────────
  { category: "metas", key: "aderencia_preventiva_min", label: "Aderência preventiva mínima", value: 85, valueType: "percent", description: "Meta de aderência das preventivas (%)." },
  { category: "metas", key: "disponibilidade_min", label: "Disponibilidade mínima", value: 85, valueType: "percent", description: "Meta de disponibilidade (%)." },
  { category: "metas", key: "os_fechadas_sem_execucao", label: "OS fechadas sem execução (meta)", value: 0, valueType: "number", description: "Quantidade aceitável de OS fechadas sem execução." },
  { category: "metas", key: "os_atrasadas", label: "OS atrasadas (meta)", value: 0, valueType: "number", description: "Quantidade aceitável de OS atrasadas." },
  { category: "metas", key: "compras_atrasadas_max", label: "Compras atrasadas (máximo)", value: 5, valueType: "number", description: "Limite de compras em atraso." },
  { category: "metas", key: "horas_semanais_padrao", label: "Horas semanais padrão", value: 44, valueType: "number", description: "Carga horária semanal padrão." },

  // ── Regras de Ordens de Serviço ───────────────────────────────────────
  { category: "ordens", key: "hora_minima_realizada", label: "Hora mínima OS realizada", value: 0.1, valueType: "number", description: "Trabalho real (h) acima do qual a OS é considerada realizada." },
  { category: "ordens", key: "status_sem_responsavel", label: "Sinalizar OS sem responsável", value: true, valueType: "boolean", description: "Destaca ordens sem responsável informado." },
  { category: "ordens", key: "excluir_plpv_alertas_gerais", label: "Excluir PL/PV dos alertas gerais", value: true, valueType: "boolean", description: "Mantém PL/PV fora dos alertas críticos gerais." },

  // ── Preventivas Programadas (integração REAL nesta fase) ───────────────
  { category: "preventivas", key: "prefixo_lubrificacao", label: "Prefixo Lubrificação (PL)", value: "PL -", valueType: "text", description: "Prefixo do título que identifica ordens de lubrificação." },
  { category: "preventivas", key: "prefixo_preventiva_eletrica", label: "Prefixo Preventiva Elétrica (PV)", value: "PV -", valueType: "text", description: "Prefixo do título que identifica preventivas elétricas." },
  { category: "preventivas", key: "hora_minima_realizada", label: "Hora mínima para realizada", value: 0.1, valueType: "number", description: "workedHours acima deste valor = realizada." },
  { category: "preventivas", key: "regra_realizada", label: "Regra realizada", value: "workedHours > 0,1", valueType: "text", isEditable: false, description: "Descrição da regra de execução (derivada)." },
  { category: "preventivas", key: "regra_nao_realizada", label: "Regra não realizada", value: "workedHours <= 0,1", valueType: "text", isEditable: false, description: "Descrição da regra (derivada)." },
  { category: "preventivas", key: "meta_aderencia_pl", label: "Meta aderência PL", value: 85, valueType: "percent", description: "Meta de aderência da lubrificação (%)." },
  { category: "preventivas", key: "meta_aderencia_pv", label: "Meta aderência PV", value: 85, valueType: "percent", description: "Meta de aderência da preventiva elétrica (%)." },

  // ── Regras PC-Factory (base oficial travada) ──────────────────────────
  { category: "pc_factory", key: "base_oficial_tempo", label: "Base oficial de tempo", value: "durationHours", valueType: "select", options: ["durationHours", "realDurationHours"], isEditable: false, description: "Base de horas oficial do Management View. Trava em durationHours." },
  { category: "pc_factory", key: "descricao", label: "Descrição da base", value: "Tempo Decorrido / Management View", valueType: "text", isEditable: false },
  { category: "pc_factory", key: "real_duration_hours", label: "realDurationHours", value: "auditoria", valueType: "text", isEditable: false, description: "Mantido apenas para auditoria." },
  { category: "pc_factory", key: "ler_cores_planilha", label: "Ler cores da planilha", value: true, valueType: "boolean", description: "Usa as cores de status vindas da planilha." },
  { category: "pc_factory", key: "excluir_do_planejado", label: "Excluir do planejado", value: ["Fora de Turno", "Recurso Não Programado"], valueType: "wordlist", description: "Status que ficam fora do tempo planejado." },

  // ── Regras de Compras ─────────────────────────────────────────────────
  { category: "compras", key: "grupo_compra_normal", label: "Grupo compra normal", value: "Y01", valueType: "text", description: "Código do grupo de compra normal." },
  { category: "compras", key: "grupo_regularizacao", label: "Grupo regularização", value: "Y04", valueType: "text", description: "Código do grupo de regularização." },
  { category: "compras", key: "bloqueados_fora_kpis", label: "Bloqueados fora dos KPIs", value: true, valueType: "boolean", description: "Mantém itens bloqueados fora dos KPIs principais." },
  { category: "compras", key: "palavras_bloqueadas", label: "Palavras bloqueadas", value: ["BLOQ", "Bloqueado"], valueType: "wordlist", description: "Termos que marcam um item como bloqueado." },
  { category: "compras", key: "servicos_separados", label: "Serviços separados", value: true, valueType: "boolean", description: "Classifica serviços separadamente." },
  { category: "compras", key: "palavras_servico", label: "Palavras de serviço", value: ["serv", "serviço", "servico", "prest"], valueType: "wordlist", description: "Termos que indicam serviço." },

  // ── Central de Procedimentos ──────────────────────────────────────────
  { category: "procedimentos", key: "exclusao_logica", label: "Exclusão lógica", value: true, valueType: "boolean", description: "Arquiva em vez de apagar definitivamente." },
  { category: "procedimentos", key: "categorias_editaveis", label: "Categorias editáveis", value: true, valueType: "boolean", description: "Permite editar categorias de procedimentos." },
  { category: "procedimentos", key: "exigir_leitura_criticos", label: "Exigir leitura em críticos", value: true, valueType: "boolean", description: "Exige confirmação de leitura em procedimentos críticos." },

  // ── Alertas ───────────────────────────────────────────────────────────
  { category: "alertas", key: "os_atrasada", label: "Alerta: OS atrasada", value: true, valueType: "boolean" },
  { category: "alertas", key: "compra_vencida", label: "Alerta: compra vencida", value: true, valueType: "boolean" },
  { category: "alertas", key: "pcfactory_parada", label: "Alerta: parada PC-Factory", value: true, valueType: "boolean" },
  { category: "alertas", key: "preventiva_nao_executada", label: "Alerta: preventiva não executada", value: true, valueType: "boolean" }
];

/** Metadados de cada categoria para a UI (título e ordem). */
export const SETTING_CATEGORY_META: Record<SettingCategory, { title: string; description: string }> = {
  geral: { title: "Geral", description: "Nome do portal, versão, empresa e preferências gerais." },
  metas: { title: "Metas dos Indicadores", description: "Metas de aderência, disponibilidade, atrasos e horas." },
  ordens: { title: "Regras de Ordens de Serviço", description: "OS realizadas, sem responsável e tratamento de PL/PV." },
  preventivas: { title: "Regras de Preventivas Programadas", description: "Prefixos PL/PV, hora mínima e metas de aderência." },
  pc_factory: { title: "Regras PC-Factory", description: "Base de tempo, cores e exclusões do Management View." },
  compras: { title: "Regras de Compras", description: "Y01, Y04, bloqueados e serviços." },
  procedimentos: { title: "Central de Procedimentos", description: "Exclusão lógica, categorias e leitura obrigatória." },
  alertas: { title: "Alertas", description: "Liga/desliga dos alertas operacionais." }
};

/** Mapa key -> valor padrão dentro de uma categoria (fallback rápido). */
export function defaultValue(category: SettingCategory, key: string): SettingValue | undefined {
  return DEFAULT_SETTINGS.find((s) => s.category === category && s.key === key)?.value;
}
