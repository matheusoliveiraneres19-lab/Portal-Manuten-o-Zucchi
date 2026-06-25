/**
 * Seed IDEMPOTENTE da Central de Procedimentos (fase 02). Faz upsert por `slug` —
 * NÃO apaga dados existentes. Re-rodar apenas atualiza os 10 procedimentos-semente.
 *
 * USO (PowerShell):
 *   npx tsx --env-file=.env scripts/seed-procedures.ts
 *
 * Usa a conexão DIRETA (DIRECT_URL, 5432) — o pooler (6543) nem sempre é alcançável
 * de uma máquina local. Ver scripts/audit-pc-factory-reliability.ts.
 */
import { ProcedureCategory, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  log: ["error"]
});

function categoryEnum(name: string): ProcedureCategory {
  switch (name) {
    case "Mecânica": return ProcedureCategory.MECANICA;
    case "Elétrica": return ProcedureCategory.ELETRICA;
    case "Lubrificação": return ProcedureCategory.LUBRIFICACAO;
    case "Segurança": return ProcedureCategory.SEGURANCA;
    case "SAP/Fiori":
    case "Ordem de Serviço": return ProcedureCategory.PCM;
    case "PC-Factory": return ProcedureCategory.OPERACIONAL;
    default: return ProcedureCategory.OUTROS;
  }
}

type Seed = {
  slug: string;
  title: string;
  categoryName: string;
  level: string;
  estimatedMinutes: number;
  targetAudience: string;
  responsible: string;
  summary: string;
  objective: string;
  whenToUse: string;
  content: string;
  commonMistakes?: string;
  tags: string[];
  isFeatured?: boolean;
  isOnboarding?: boolean;
  onboardingOrder?: number;
};

const SEEDS: Seed[] = [
  {
    slug: "como-realizar-bloqueio-antes-da-intervencao",
    title: "Como realizar bloqueio antes da intervenção",
    categoryName: "Segurança",
    level: "Avançado",
    estimatedMinutes: 6,
    targetAudience: "Toda a equipe de manutenção",
    responsible: "SESMT",
    summary: "Procedimento de bloqueio e etiquetagem (LOTO) antes de qualquer intervenção.",
    objective: "Garantir energia zero e impedir religamento acidental durante a manutenção.",
    whenToUse: "Sempre antes de intervir em equipamento com energia elétrica, hidráulica ou pneumática.",
    content:
      "1. Identifique todas as fontes de energia do equipamento.\n2. Desligue o equipamento pelo comando local.\n3. Aplique o bloqueio físico no dispositivo de seccionamento.\n4. Coloque a etiqueta de bloqueio com seu nome e data.\n5. Teste a ausência de energia (tente acionar — deve permanecer parado).\n6. Só então inicie a intervenção.\n7. Ao final, remova o bloqueio apenas você, conferindo a área antes de religar.",
    commonMistakes: "Confiar apenas no botão de parada; não testar a ausência de energia; outro colega remover seu bloqueio.",
    tags: ["bloqueio", "loto", "segurança", "energia", "lockout"],
    isOnboarding: true,
    onboardingOrder: 1
  },
  {
    slug: "como-preencher-corretamente-uma-os",
    title: "Como preencher corretamente uma OS",
    categoryName: "Ordem de Serviço",
    level: "Básico",
    estimatedMinutes: 4,
    targetAudience: "Mecânicos e Eletricistas",
    responsible: "PCM",
    summary: "Boas práticas para descrever serviço, causa e solução em uma ordem.",
    objective: "Padronizar o registro para alimentar o histórico do equipamento e os indicadores.",
    whenToUse: "Ao atender e registrar qualquer ordem de serviço de manutenção.",
    content:
      "1. Confirme o equipamento e o número da OS.\n2. Descreva o sintoma/relato encontrado.\n3. Registre a causa raiz identificada.\n4. Descreva a solução aplicada e materiais usados.\n5. Aponte as horas trabalhadas.\n6. Informe se ficou pendência e qual.",
    commonMistakes: "Descrições genéricas ('consertado'); não informar causa; esquecer de apontar horas.",
    tags: ["os", "ordem de serviço", "descrição", "preencher"],
    isFeatured: true,
    isOnboarding: true,
    onboardingOrder: 2
  },
  {
    slug: "como-apontar-horas-no-sap-fiori",
    title: "Como apontar horas no SAP Fiori",
    categoryName: "SAP/Fiori",
    level: "Básico",
    estimatedMinutes: 3,
    targetAudience: "Mecânicos, Eletricistas e Lubrificadores",
    responsible: "PCM",
    summary: "Passo a passo para apontar horas trabalhadas em uma ordem no SAP Fiori.",
    objective: "Registrar corretamente as horas para alimentar o banco de horas e os custos da OS.",
    whenToUse: "Ao concluir (ou pausar) o atendimento de uma ordem de serviço.",
    content:
      "1. Acesse o app de apontamento no SAP Fiori.\n2. Busque a ordem pelo número.\n3. Selecione a operação correspondente.\n4. Informe a data e as horas trabalhadas.\n5. Confirme e salve o apontamento.\n6. Verifique se o lançamento aparece no histórico da ordem.",
    commonMistakes: "Apontar na operação errada; lançar horas no dia errado; esquecer de salvar.",
    tags: ["sap", "fiori", "apontamento", "horas", "apontar horas"],
    isFeatured: true,
    isOnboarding: true,
    onboardingOrder: 3
  },
  {
    slug: "como-alterar-status-para-manutencao-mecanica-no-pc-factory",
    title: "Como alterar status para Manutenção Mecânica no PC-Factory",
    categoryName: "PC-Factory",
    level: "Básico",
    estimatedMinutes: 2,
    targetAudience: "Mecânicos",
    responsible: "Engenharia de Manutenção",
    summary: "Como sinalizar no PC-Factory que a máquina está em manutenção mecânica.",
    objective: "Garantir que a parada seja contabilizada corretamente como Manutenção Mecânica.",
    whenToUse: "Ao iniciar um reparo mecânico na máquina.",
    content:
      "1. Selecione o recurso/máquina no PC-Factory.\n2. Abra a troca de status.\n3. Escolha 'Manutenção Mecânica'.\n4. Confirme o horário de início.\n5. Ao concluir, altere para o status seguinte (produção ou aguardando).",
    commonMistakes: "Deixar a máquina em 'Aguardando Manutenção' durante o reparo; esquecer de encerrar o status.",
    tags: ["pc-factory", "status", "manutenção mecânica", "mecânica"],
    isOnboarding: true,
    onboardingOrder: 4
  },
  {
    slug: "como-fechar-uma-ordem-de-manutencao",
    title: "Como fechar uma ordem de manutenção",
    categoryName: "Ordem de Serviço",
    level: "Básico",
    estimatedMinutes: 4,
    targetAudience: "Mecânicos e Eletricistas",
    responsible: "PCM",
    summary: "Etapas para encerrar uma ordem garantindo que nada fique pendente.",
    objective: "Encerrar a ordem com todos os registros completos (horas, causa, solução).",
    whenToUse: "Quando o serviço foi concluído e validado.",
    content:
      "1. Confirme que o serviço foi concluído.\n2. Verifique se as horas foram apontadas.\n3. Confira causa e solução preenchidas.\n4. Registre materiais utilizados.\n5. Encerre a ordem no sistema (status FECHADA).\n6. Comunique o solicitante, se necessário.",
    commonMistakes: "Fechar sem apontar horas; fechar com pendência de material em aberto.",
    tags: ["os", "ordem", "fechar", "encerrar", "finalizar"],
    isFeatured: true,
    isOnboarding: true,
    onboardingOrder: 5
  },
  {
    slug: "como-consultar-historico-de-equipamento",
    title: "Como consultar histórico de equipamento",
    categoryName: "SAP/Fiori",
    level: "Intermediário",
    estimatedMinutes: 4,
    targetAudience: "Manutentores e Planejadores",
    responsible: "PCM",
    summary: "Como ver ordens, falhas e intervenções anteriores de um equipamento.",
    objective: "Apoiar o diagnóstico consultando o histórico de manutenção do ativo.",
    whenToUse: "Antes de iniciar um reparo ou ao analisar recorrência de falhas.",
    content:
      "1. Acesse a consulta de equipamento no SAP Fiori.\n2. Informe o código/TAG do equipamento.\n3. Filtre por período.\n4. Analise ordens anteriores, causas e soluções.\n5. Identifique padrões de falha recorrente.",
    tags: ["sap", "histórico", "equipamento", "consulta"],
    isFeatured: true
  },
  {
    slug: "como-alterar-status-para-manutencao-eletrica-no-pc-factory",
    title: "Como alterar status para Manutenção Elétrica no PC-Factory",
    categoryName: "PC-Factory",
    level: "Básico",
    estimatedMinutes: 2,
    targetAudience: "Eletricistas",
    responsible: "Engenharia de Manutenção",
    summary: "Como sinalizar no PC-Factory que a máquina está em manutenção elétrica.",
    objective: "Garantir que a parada seja contabilizada corretamente como Manutenção Elétrica.",
    whenToUse: "Ao iniciar um reparo elétrico na máquina.",
    content:
      "1. Selecione o recurso/máquina no PC-Factory.\n2. Abra a troca de status.\n3. Escolha 'Manutenção Elétrica'.\n4. Confirme o horário de início.\n5. Ao concluir, altere para o status seguinte.",
    commonMistakes: "Classificar reparo elétrico como mecânico; não encerrar o status.",
    tags: ["pc-factory", "status", "manutenção elétrica", "elétrica"]
  },
  {
    slug: "quando-usar-aguardando-manutencao",
    title: "Quando usar Aguardando Manutenção",
    categoryName: "PC-Factory",
    level: "Intermediário",
    estimatedMinutes: 5,
    targetAudience: "Operadores e Manutentores",
    responsible: "Engenharia de Manutenção",
    summary: "Diferença entre 'Aguardando Manutenção' e os status de reparo em andamento.",
    objective: "Registrar corretamente o tempo de espera, separado do tempo de reparo (MTTA x MTTR).",
    whenToUse: "Quando a máquina parou e aguarda a chegada/início da equipe de manutenção.",
    content:
      "1. Use 'Aguardando Manutenção' assim que a máquina para e a manutenção foi chamada.\n2. Mantenha esse status apenas enquanto NINGUÉM está reparando.\n3. Quando o técnico inicia o reparo, troque para Manutenção Mecânica/Elétrica/Automação.\n4. Não use 'Aguardando' durante o reparo — isso distorce o MTTR.",
    commonMistakes: "Manter 'Aguardando' durante o reparo; nunca sair de 'Aguardando'.",
    tags: ["pc-factory", "aguardando manutenção", "status", "espera", "mtta"],
    isFeatured: true
  },
  {
    slug: "como-solicitar-material-para-manutencao",
    title: "Como solicitar material para manutenção",
    categoryName: "Ordem de Serviço",
    level: "Intermediário",
    estimatedMinutes: 5,
    targetAudience: "Mecânicos e Eletricistas",
    responsible: "Suprimentos",
    summary: "Como abrir requisição de material vinculada à ordem de serviço.",
    objective: "Solicitar materiais de forma rastreável e vinculada à OS.",
    whenToUse: "Quando faltar material para concluir um serviço.",
    content:
      "1. Identifique o material e a quantidade necessária.\n2. Abra a requisição vinculada à OS.\n3. Informe código do material (se houver) e descrição.\n4. Justifique a necessidade.\n5. Acompanhe o status da requisição até a entrega.",
    commonMistakes: "Requisição sem vínculo com a OS; descrição imprecisa do material.",
    tags: ["material", "requisição", "compra", "os", "solicitar"]
  },
  {
    slug: "como-registrar-consumo-de-lubrificante",
    title: "Como registrar consumo de lubrificante",
    categoryName: "Lubrificação",
    level: "Básico",
    estimatedMinutes: 4,
    targetAudience: "Lubrificadores",
    responsible: "PCM",
    summary: "Como lançar o consumo de óleo/graxa por equipamento.",
    objective: "Manter o estoque e o histórico de consumo de lubrificantes corretos.",
    whenToUse: "Após cada aplicação de lubrificante em um equipamento.",
    content:
      "1. Identifique o lubrificante e o equipamento.\n2. Registre a quantidade aplicada e a unidade.\n3. Informe a data da aplicação.\n4. Confirme o lançamento (saída de estoque).\n5. Verifique se o estoque foi atualizado.",
    commonMistakes: "Não registrar a saída; lançar unidade errada (L x kg).",
    tags: ["lubrificação", "óleo", "graxa", "consumo", "estoque"]
  }
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const seed of SEEDS) {
    const tags = seed.tags.join(", ");
    const existing = await prisma.procedure.findUnique({ where: { slug: seed.slug }, select: { id: true } });

    const payload = {
      title: seed.title,
      category: categoryEnum(seed.categoryName),
      categoryName: seed.categoryName,
      level: seed.level,
      estimatedMinutes: seed.estimatedMinutes,
      targetAudience: seed.targetAudience,
      responsible: seed.responsible,
      summary: seed.summary,
      objective: seed.objective,
      whenToUse: seed.whenToUse,
      content: seed.content,
      commonMistakes: seed.commonMistakes ?? null,
      tags,
      status: "Publicado",
      isFeatured: Boolean(seed.isFeatured),
      isOnboarding: Boolean(seed.isOnboarding),
      onboardingOrder: seed.onboardingOrder ?? null,
      active: true
    };

    await prisma.procedure.upsert({
      where: { slug: seed.slug },
      update: payload,
      create: { slug: seed.slug, ...payload }
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const total = await prisma.procedure.count({ where: { status: "Publicado" } });
  console.log(`Seed concluído: ${created} criado(s), ${updated} atualizado(s).`);
  console.log(`Procedimentos publicados no banco: ${total}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
