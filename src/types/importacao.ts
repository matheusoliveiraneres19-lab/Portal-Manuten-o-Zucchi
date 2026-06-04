import type {
  Criticality,
  ImportStatus,
  ImportType,
  MaintenanceType,
  PurchaseStatus,
  ServiceOrderStatus
} from "@prisma/client";

export type TipoImportacao =
  | "ORDENS_SERVICO"
  | "COMPRAS"
  | "MATERIAIS"
  | "LUBRIFICANTES"
  | "HORAS_APONTADAS"
  | "EQUIPAMENTOS"
  | "PROCEDIMENTOS";

export type ErroImportacao = {
  linha: number;
  coluna?: string;
  campo?: string;
  valor?: unknown;
  mensagem: string;
};

export type ResultadoValidacaoImportacao<T = Record<string, unknown>> = {
  valido: boolean;
  dados: T[];
  erros: ErroImportacao[];
  avisos: ErroImportacao[];
};

export type ResumoImportacao = {
  tipo: TipoImportacao | ImportType;
  arquivo: string;
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  linhasCriadas: number;
  linhasAtualizadas: number;
  status: ImportStatus;
};

export type LinhaImportacao = Record<string, unknown>;

export type StatusOSPadronizado = ServiceOrderStatus | null;

export type TipoManutencaoPadronizado = MaintenanceType | null;

export type CriticidadePadronizada = Criticality | null;

export type StatusCompraPadronizado = PurchaseStatus | null;

export type TipoMovimentoLubrificantePadronizado = "COMPRA" | "CONSUMO" | "AJUSTE" | null;

export type LinhaOrdemServicoNormalizada = {
  osNumber?: unknown;
  title?: unknown;
  description?: unknown;
  statusPortal?: unknown;
  statusSAP?: unknown;
  type?: unknown;
  area?: unknown;
  priority?: unknown;
  responsibleName?: unknown;
  responsibleId?: unknown;
  equipmentCode?: unknown;
  equipmentName?: unknown;
  technicalObject?: unknown;
  planningGroup?: unknown;
  planningGroupCode?: unknown;
  openedAt?: unknown;
  workedHours?: unknown;
  operation?: unknown;
  operationCode?: unknown;
  source?: unknown;
  importBatch?: unknown;
  dataQualityIssue?: unknown;
};

export type ResultadoImportacaoOrdensServico = {
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  errors: ErroImportacao[];
};
