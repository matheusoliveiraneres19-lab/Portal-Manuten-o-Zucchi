/**
 * Tipos da auditoria administrativa e do histórico de importações (fase 03).
 * As datas são serializadas em ISO para cruzar a fronteira server→client.
 */

/** Ações sensíveis auditadas. Valores estáveis (gravados no banco). */
export const AUDIT_ACTIONS = {
  LOGIN: "login",
  TROCA_SENHA: "troca_senha",
  CRIAR_USUARIO: "criar_usuario",
  EDITAR_USUARIO: "editar_usuario",
  CRIAR_PROCEDIMENTO: "criar_procedimento",
  EDITAR_PROCEDIMENTO: "editar_procedimento",
  EXCLUIR_PROCEDIMENTO: "excluir_procedimento",
  ALTERAR_CONFIGURACAO: "alterar_configuracao",
  IMPORTAR_PLANILHA: "importar_planilha",
  ERRO_IMPORTACAO: "erro_importacao"
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Módulos onde as ações acontecem. */
export const AUDIT_MODULES = {
  AUTENTICACAO: "autenticacao",
  USUARIOS: "usuarios",
  PROCEDIMENTOS: "procedimentos",
  CONFIGURACOES: "configuracoes",
  IMPORTACAO: "importacao"
} as const;

/** Rótulos amigáveis para exibição na tabela de auditoria. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  login: "Login",
  troca_senha: "Troca de senha",
  criar_usuario: "Criação de usuário",
  editar_usuario: "Edição de usuário",
  criar_procedimento: "Criação de procedimento",
  editar_procedimento: "Edição de procedimento",
  excluir_procedimento: "Exclusão/arquivamento de procedimento",
  alterar_configuracao: "Alteração de configuração",
  importar_planilha: "Importação de planilha",
  erro_importacao: "Erro de importação"
};

export const AUDIT_MODULE_LABELS: Record<string, string> = {
  autenticacao: "Autenticação",
  usuarios: "Usuários",
  procedimentos: "Procedimentos",
  configuracoes: "Configurações",
  importacao: "Importação"
};

export type AuditLogDTO = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  actionLabel: string;
  module: string;
  moduleLabel: string;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

export type AuditLogFilters = {
  /** Início do período (ISO ou Date). */
  from?: Date | string;
  /** Fim do período (ISO ou Date). */
  to?: Date | string;
  module?: string;
  action?: string;
  /** Busca por nome/login do usuário (case-insensitive, contém). */
  user?: string;
  limit?: number;
};

/**
 * Rótulos amigáveis do enum ImportType (Prisma). O histórico de importações
 * permanece sobre o model ImportHistory existente — apenas exibido com nomes claros.
 */
export const IMPORT_TYPE_LABELS: Record<string, string> = {
  ORDENS_SERVICO: "Ordens de Serviço",
  COMPRAS: "Compras",
  MATERIAIS: "Materiais",
  LUBRIFICANTES: "Lubrificantes",
  HORAS_APONTADAS: "Horas Apontadas",
  EQUIPAMENTOS: "Equipamentos",
  PROCEDIMENTOS: "Procedimentos",
  PC_FACTORY: "PC-Factory"
};

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  SUCESSO: "Sucesso",
  PARCIAL: "Parcial",
  ERRO: "Erro",
  EM_PROCESSAMENTO: "Em processamento"
};

export type ImportHistoryDTO = {
  id: string;
  type: string;
  moduleLabel: string;
  fileName: string;
  importedBy: string | null;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  status: string;
  statusLabel: string;
  errorMessage: string | null;
  createdAt: string;
};

export type ImportHistoryFilters = {
  from?: Date | string;
  to?: Date | string;
  /** Valor do enum ImportType (ex.: "PC_FACTORY"). */
  type?: string;
  /** Valor do enum ImportStatus (ex.: "SUCESSO"). */
  status?: string;
  limit?: number;
};

export type LastImportInfo = {
  type: string;
  moduleLabel: string;
  fileName: string | null;
  status: string | null;
  statusLabel: string | null;
  at: string | null;
};

export type SystemTechnicalStatus = {
  database: "conectado" | "desconectado";
  auth: "ativa" | "inativa";
  deploy: string;
  /** Última importação por módulo de interesse (PC-Factory, OS, Compras). */
  lastImports: LastImportInfo[];
  /** Último erro de importação registrado (mensagem segura, sem dados sensíveis). */
  lastError: { moduleLabel: string; message: string; at: string } | null;
};
