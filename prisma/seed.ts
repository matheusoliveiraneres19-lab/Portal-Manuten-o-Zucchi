import {
  AlertStatus,
  AlertType,
  Criticality,
  DataSource,
  EquipmentStatus,
  ImportStatus,
  ImportType,
  LubricantMovementType,
  MaintenanceArea,
  MaintenanceType,
  MaterialMovementType,
  PrismaClient,
  Priority,
  ProcedureCategory,
  PurchaseStatus,
  Role,
  ServiceOrderStatus,
  UserStatus
} from "@prisma/client";

const prisma = new PrismaClient();
const seedOwner = "Seed Zucchi";

const parseDate = (value: string) => new Date(`${value}T09:00:00.000Z`);
const mayDate = (day: number, hour = 8) =>
  new Date(`2024-05-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`);

async function cleanGeneratedSeedData() {
  await prisma.timeEntry.deleteMany({ where: { observation: "Seed dashboard horas" } });
  await prisma.alert.deleteMany({
    where: {
      title: {
        in: [
          "Vibração acima do normal",
          "Pressão instável",
          "Temperatura elevada",
          "Equipamento parado",
          "Quebra recorrente",
          "Estoque baixo",
          "Compra de rolamento atrasada"
        ]
      }
    }
  });
  await prisma.lubricantMovement.deleteMany({ where: { responsible: seedOwner } });
  await prisma.materialMovement.deleteMany({ where: { responsible: seedOwner } });
  await prisma.serviceOrder.deleteMany({ where: { osNumber: { startsWith: "OS-2024-05-" } } });
  await prisma.purchase.deleteMany({
    where: { OR: [{ requester: seedOwner }, { materialCode: { startsWith: "CMP-SEED-" } }] }
  });
  await prisma.procedure.deleteMany({ where: { responsible: seedOwner } });
  await prisma.importHistory.deleteMany({ where: { importedBy: seedOwner } });
}

async function seedUsers() {
  // passwordHash está temporariamente simples para desenvolvimento local; em produção deve usar bcrypt.
  const users = [
    ["Administrador", "admin", "admin@zucchi.local", Role.ADMIN, "Administrador do Portal", "Manutenção"],
    ["Manutenção Zucchi", "manutencao", "manutencao@zucchi.local", Role.GESTOR, "Gestão da Manutenção", "Manutenção"],
    ["Carlos Ferreira", "carlos.ferreira", "carlos.ferreira@zucchi.local", Role.GESTOR, "Supervisor de Manutenção", "Manutenção"],
    ["João Silva", "joao.silva", "joao.silva@zucchi.local", Role.TECNICO, "Mecânico Industrial", "Manutenção"],
    ["Marcos Paulo", "marcos.paulo", "marcos.paulo@zucchi.local", Role.TECNICO, "Técnico PCM", "PCM"],
    ["José Santos", "jose.santos", "jose.santos@zucchi.local", Role.TECNICO, "Lubrificador", "Manutenção"],
    ["Rafael Lima", "rafael.lima", "rafael.lima@zucchi.local", Role.TECNICO, "Eletricista Industrial", "Manutenção"]
  ] as const;

  const result: Record<string, { id: string }> = {};
  for (const [name, login, email, role, position, sector] of users) {
    result[name] = await prisma.user.upsert({
      where: { login },
      update: { name, email, passwordHash: "admin123", role, status: UserStatus.ATIVO, position, sector },
      create: { name, login, email, passwordHash: "admin123", role, status: UserStatus.ATIVO, position, sector }
    });
  }
  return result;
}

async function seedEquipment() {
  const items = [
    ["PR-001", "Ponte Rolante Principal", "Beneficiamento", Criticality.CRITICA, EquipmentStatus.OPERANDO, "Konecranes", "PR-50T"],
    ["TB-400", "Teares Breton Z400", "Serraria", Criticality.CRITICA, EquipmentStatus.OPERANDO, "Breton", "Z400"],
    ["PA-036", "Politriz Automática P36", "Polimento", Criticality.ALTA, EquipmentStatus.EM_MANUTENCAO, "Pedrini", "P36"],
    ["CP-001", "Compressor Atlas Copco", "Utilidades", Criticality.ALTA, EquipmentStatus.OPERANDO, "Atlas Copco", "GA75"],
    ["BA-001", "Bomba d'água Industrial", "ETA Industrial", Criticality.MEDIA, EquipmentStatus.OPERANDO, "KSB", "MegaCPK"],
    ["CT-3000", "Cortadeira GMM 3000", "Corte", Criticality.ALTA, EquipmentStatus.OPERANDO, "GMM", "3000"],
    ["EC-001", "Esteira de Classificação 01", "Expedição", Criticality.MEDIA, EquipmentStatus.OPERANDO, "Zucchi", "EC-01"],
    ["LR-002", "Linha de Resinagem 02", "Resinagem", Criticality.ALTA, EquipmentStatus.OPERANDO, "Barsanti", "LR-02"],
    ["SM-001", "Serra Monofio 01", "Serraria", Criticality.CRITICA, EquipmentStatus.PARADO, "Pellegrini", "SM-01"],
    ["SE-001", "Sistema de Exaustão Central", "Utilidades", Criticality.MEDIA, EquipmentStatus.OPERANDO, "Nederman", "SEC-900"]
  ] as const;

  const result: Record<string, { id: string }> = {};
  for (const [code, name, sector, criticality, status, manufacturer, model] of items) {
    result[name] = await prisma.equipment.upsert({
      where: { code },
      update: { name, sector, location: sector, manufacturer, model, status, criticality },
      create: { code, name, sector, location: sector, manufacturer, model, status, criticality }
    });
  }
  return result;
}

async function seedServiceOrders(equipment: Record<string, { id: string }>) {
  const weightedEquipment = [
    "Teares Breton Z400",
    "Politriz Automática P36",
    "Ponte Rolante Principal",
    "Cortadeira GMM 3000",
    "Compressor Atlas Copco",
    "Teares Breton Z400",
    "Politriz Automática P36",
    "Serra Monofio 01",
    "Linha de Resinagem 02",
    "Bomba d'água Industrial"
  ];
  const descriptions = [
    "Vibração acima do normal",
    "Falha em sensor de segurança",
    "Vazamento hidráulico",
    "Temperatura elevada no motor",
    "Ruído anormal em rolamento",
    "Pressão instável na linha de ar",
    "Correia com desgaste",
    "Falha elétrica intermitente",
    "Falha no inversor de frequência",
    "Baixo nível de óleo"
  ];
  const responsibles = ["Carlos Ferreira", "João Silva", "Marcos Paulo", "José Santos", "Rafael Lima"];
  const saved: Array<{ id: string; osNumber: string }> = [];

  for (let index = 0; index < 156; index += 1) {
    const type = index < 104 ? MaintenanceType.CORRETIVA : MaintenanceType.PREVENTIVA;
    const status =
      index < 12
        ? ServiceOrderStatus.ABERTA
        : index < 24
          ? ServiceOrderStatus.EM_ANDAMENTO
          : index < 32
            ? ServiceOrderStatus.AGUARDANDO_MATERIAL
            : index < 36
              ? ServiceOrderStatus.CANCELADA
              : ServiceOrderStatus.FECHADA;
    const day = (index % 31) + 1;
    const openedAt = mayDate(day, 6 + (index % 10));
    const closedAt =
      status === ServiceOrderStatus.FECHADA || status === ServiceOrderStatus.CANCELADA
        ? mayDate(Math.min(31, day + 1), 14)
        : null;
    const area = [MaintenanceArea.MECANICA, MaintenanceArea.ELETRICA, MaintenanceArea.LUBRIFICACAO, MaintenanceArea.PCM, MaintenanceArea.OPERACIONAL][index % 5];
    const description = descriptions[index % descriptions.length];
    const equipmentName = weightedEquipment[index % weightedEquipment.length];
    const osNumber = `OS-2024-05-${String(index + 1).padStart(4, "0")}`;

    saved.push(
      await prisma.serviceOrder.upsert({
        where: { osNumber },
        update: {
          title: `${type === MaintenanceType.CORRETIVA ? "Correção" : "Preventiva"} - ${description}`,
          description,
          type,
          area,
          status,
          priority: index % 9 === 0 ? Priority.CRITICA : index % 3 === 0 ? Priority.ALTA : Priority.MEDIA,
          responsible: responsibles[index % responsibles.length],
          equipmentId: equipment[equipmentName].id,
          openedAt,
          closedAt,
          downtimeHours: type === MaintenanceType.CORRETIVA ? Number((1.5 + (index % 7) * 0.6).toFixed(1)) : 0,
          workedHours: Number((1.25 + (index % 6) * 0.75).toFixed(1)),
          failureCause: type === MaintenanceType.CORRETIVA ? "Desgaste operacional identificado durante inspeção" : "Plano preventivo programado pelo PCM",
          solution: closedAt ? "Serviço executado, testado e liberado para operação" : "Atendimento em acompanhamento pela equipe de manutenção",
          source: index % 4 === 0 ? DataSource.EXCEL : DataSource.MANUAL
        },
        create: {
          osNumber,
          title: `${type === MaintenanceType.CORRETIVA ? "Correção" : "Preventiva"} - ${description}`,
          description,
          type,
          area,
          status,
          priority: index % 9 === 0 ? Priority.CRITICA : index % 3 === 0 ? Priority.ALTA : Priority.MEDIA,
          responsible: responsibles[index % responsibles.length],
          equipmentId: equipment[equipmentName].id,
          openedAt,
          closedAt,
          downtimeHours: type === MaintenanceType.CORRETIVA ? Number((1.5 + (index % 7) * 0.6).toFixed(1)) : 0,
          workedHours: Number((1.25 + (index % 6) * 0.75).toFixed(1)),
          failureCause: type === MaintenanceType.CORRETIVA ? "Desgaste operacional identificado durante inspeção" : "Plano preventivo programado pelo PCM",
          solution: closedAt ? "Serviço executado, testado e liberado para operação" : "Atendimento em acompanhamento pela equipe de manutenção",
          source: index % 4 === 0 ? DataSource.EXCEL : DataSource.MANUAL
        }
      })
    );
  }
  return saved;
}

async function seedPurchases(equipment: Record<string, { id: string }>) {
  const names = Object.keys(equipment);
  const pending = [
    ["Rolamento 6312 ZZ", "MAT-001", "SKF", "2024-05-25", 1250, PurchaseStatus.ATRASADA],
    ["Óleo Hidráulico ISO 68", "LUB-001", "Petrobrás", "2024-05-27", 2340, PurchaseStatus.SOLICITADA],
    ["Correia Poly-V BX58", "MAT-002", "Gates", "2024-05-28", 680, PurchaseStatus.EM_COTACAO],
    ["Graxa Industrial 2 KG", "MAT-021", "Klüber", "2024-05-30", 420, PurchaseStatus.APROVADA],
    ["Válvula Solenóide 24V", "MAT-004", "Festo", "2024-05-31", 950, PurchaseStatus.SOLICITADA],
    ["Sensor Indutivo 24V", "MAT-003", "Sick", "2024-05-24", 780, PurchaseStatus.SOLICITADA],
    ["Inversor de Frequência", "MAT-016", "WEG", "2024-05-26", 3200, PurchaseStatus.EM_COTACAO],
    ["Mangueira Hidráulica", "MAT-007", "Parker", "2024-05-27", 610, PurchaseStatus.APROVADA],
    ["Filtro Separador", "MAT-023", "Atlas Copco", "2024-05-29", 1350, PurchaseStatus.SOLICITADA],
    ["Disco Diamantado", "MAT-024", "Diamant Boart", "2024-05-30", 2850, PurchaseStatus.EM_COTACAO],
    ["Contato Auxiliar", "MAT-025", "Schneider", "2024-05-31", 390, PurchaseStatus.SOLICITADA],
    ["Bomba Dosadora", "MAT-026", "Grundfos", "2024-05-23", 1890, PurchaseStatus.APROVADA],
    ["Correia Transportadora", "MAT-027", "Continental", "2024-05-25", 4150, PurchaseStatus.SOLICITADA],
    ["Retentor 80x100", "MAT-008", "Sabó", "2024-05-26", 260, PurchaseStatus.EM_COTACAO],
    ["Graxa EP2 Cartucho", "LUB-003", "Mobil", "2024-05-28", 510, PurchaseStatus.APROVADA],
    ["Chave Fim de Curso", "MAT-028", "Siemens", "2024-05-29", 720, PurchaseStatus.SOLICITADA],
    ["Rolamento 22212", "MAT-029", "NSK", "2024-05-30", 1540, PurchaseStatus.EM_COTACAO],
    ["Kit Vedação Cilindro", "MAT-030", "Parker", "2024-05-31", 1760, PurchaseStatus.SOLICITADA]
  ] as const;

  for (let index = 0; index < pending.length; index += 1) {
    const [item, materialCode, supplier, expectedDate, totalValue, status] = pending[index];
    await prisma.purchase.create({
      data: {
        item,
        materialCode,
        supplier,
        status,
        priority: status === PurchaseStatus.ATRASADA ? Priority.CRITICA : index % 4 === 0 ? Priority.ALTA : Priority.MEDIA,
        quantity: 1,
        unitValue: totalValue,
        totalValue,
        requestDate: parseDate("2024-05-20"),
        expectedDate: parseDate(expectedDate),
        requester: seedOwner,
        equipmentId: equipment[names[index % names.length]].id
      }
    });
  }

  const monthly = [
    ["Janeiro", "2024-01-18", 28500],
    ["Fevereiro", "2024-02-18", 35200],
    ["Março", "2024-03-18", 32100],
    ["Abril", "2024-04-18", 41800],
    ["Maio", "2024-05-18", 37600]
  ] as const;
  for (let index = 0; index < monthly.length; index += 1) {
    const [month, purchaseDate, totalValue] = monthly[index];
    await prisma.purchase.create({
      data: {
        item: `Pacote mensal de compras - ${month}/2024`,
        materialCode: `CMP-SEED-MENSAL-${String(index + 1).padStart(2, "0")}`,
        supplier: "Fornecedores homologados Zucchi",
        status: PurchaseStatus.ENTREGUE,
        priority: Priority.MEDIA,
        quantity: 1,
        unitValue: totalValue,
        totalValue,
        requestDate: parseDate(purchaseDate),
        purchaseDate: parseDate(purchaseDate),
        expectedDate: parseDate(purchaseDate),
        requester: seedOwner
      }
    });
  }
}

async function seedMaterials(equipment: Record<string, { id: string }>) {
  const names = [
    "Rolamento 6312 ZZ",
    "Correia Poly-V BX58",
    "Sensor indutivo 24V",
    "Válvula solenóide 24V",
    "Contator 32A",
    "Disjuntor motor",
    "Mangueira hidráulica",
    "Retentor",
    "Filtro de ar",
    "Filtro hidráulico",
    "Cabo PP",
    "Terminal elétrico",
    "Fusível NH",
    "Botão de emergência",
    "Relé térmico",
    "Inversor de frequência",
    "Lâmpada sinalizadora",
    "Mancal",
    "Corrente industrial",
    "Acoplamento flexível",
    "Graxa Industrial 2 KG",
    "Correia transportadora",
    "Filtro separador",
    "Disco diamantado",
    "Contato auxiliar",
    "Bomba dosadora",
    "Chave fim de curso",
    "Rolamento 22212",
    "Kit vedação cilindro",
    "Sensor de vibração",
    "Termostato industrial",
    "Pressostato"
  ];
  const materials = [];
  for (let index = 0; index < names.length; index += 1) {
    const code = `MAT-${String(index + 1).padStart(3, "0")}`;
    materials.push(
      await prisma.material.upsert({
        where: { code },
        update: {
          name: names[index],
          category: index % 3 === 0 ? "Mecânica" : index % 3 === 1 ? "Elétrica" : "Hidráulica",
          unit: index % 5 === 0 ? "KG" : "UN",
          currentStock: 18 + index,
          minimumStock: 5 + (index % 4),
          averageValue: 35 + index * 12,
          criticality: index % 8 === 0 ? Criticality.ALTA : Criticality.MEDIA
        },
        create: {
          code,
          name: names[index],
          category: index % 3 === 0 ? "Mecânica" : index % 3 === 1 ? "Elétrica" : "Hidráulica",
          unit: index % 5 === 0 ? "KG" : "UN",
          currentStock: 18 + index,
          minimumStock: 5 + (index % 4),
          averageValue: 35 + index * 12,
          criticality: index % 8 === 0 ? Criticality.ALTA : Criticality.MEDIA
        }
      })
    );
  }

  const equipmentItems = Object.values(equipment);
  for (let index = 0; index < materials.length; index += 1) {
    const unitValue = 35 + index * 12;
    await prisma.materialMovement.createMany({
      data: [
        {
          materialId: materials[index].id,
          equipmentId: equipmentItems[index % equipmentItems.length].id,
          type: MaterialMovementType.ENTRADA,
          quantity: 10 + (index % 8),
          unitValue,
          totalValue: unitValue * (10 + (index % 8)),
          movementDate: mayDate((index % 28) + 1, 8),
          responsible: seedOwner,
          observation: "Entrada seed de estoque"
        },
        {
          materialId: materials[index].id,
          equipmentId: equipmentItems[(index + 3) % equipmentItems.length].id,
          type: MaterialMovementType.SAIDA,
          quantity: 1 + (index % 6),
          unitValue,
          totalValue: unitValue * (1 + (index % 6)),
          movementDate: mayDate((index % 28) + 1, 15),
          responsible: seedOwner,
          observation: "Saída seed para manutenção"
        }
      ]
    });
  }
}

async function seedLubricants(equipment: Record<string, { id: string }>) {
  const items = [
    ["LUB-001", "Óleo Hidráulico ISO 68", "Hidráulico"],
    ["LUB-002", "Óleo ISO VG 220", "Engrenagem"],
    ["LUB-003", "Graxa EP2", "Graxa"],
    ["LUB-004", "Graxa para Rolamentos", "Graxa"],
    ["LUB-005", "Lubrificante de Corrente", "Corrente"],
    ["LUB-006", "Óleo de Redutor", "Redutor"]
  ] as const;
  const lubricants = [];
  for (const [code, name, type] of items) {
    lubricants.push(
      await prisma.lubricant.upsert({
        where: { code },
        update: { name, type, unit: type === "Graxa" ? "KG" : "L", currentStock: code === "LUB-001" ? 45 : 180, minimumStock: 80 },
        create: { code, name, type, unit: type === "Graxa" ? "KG" : "L", currentStock: code === "LUB-001" ? 45 : 180, minimumStock: 80 }
      })
    );
  }

  const equipmentItems = Object.values(equipment);
  for (let index = 0; index < lubricants.length; index += 1) {
    await prisma.lubricantMovement.create({
      data: {
        lubricantId: lubricants[index].id,
        equipmentId: equipmentItems[index % equipmentItems.length].id,
        type: LubricantMovementType.COMPRA,
        quantity: 220 + index * 20,
        movementDate: mayDate(2 + index, 9),
        responsible: seedOwner,
        observation: "Compra seed de lubrificante"
      }
    });
  }

  const consumptions = [100, 145, 160, 130, 180, 155, 205, 170];
  for (let index = 0; index < consumptions.length; index += 1) {
    await prisma.lubricantMovement.create({
      data: {
        lubricantId: lubricants[index % lubricants.length].id,
        equipmentId: equipmentItems[index % equipmentItems.length].id,
        type: LubricantMovementType.CONSUMO,
        quantity: consumptions[index],
        movementDate: mayDate(4 + index * 3, 10),
        responsible: seedOwner,
        observation: "Consumo seed maio/2024"
      }
    });
  }
}

async function seedProcedures() {
  const titles = [
    "Procedimento OS Mecânica",
    "Procedimento OS Elétrica",
    "Procedimento de Lubrificação",
    "Procedimento de Bloqueio e Etiquetagem",
    "Procedimento de Cadastro de Equipamento",
    "Checklist de Inspeção Ponte Rolante",
    "Checklist de Compressor",
    "Checklist Linha de Resinagem",
    "Checklist Politriz",
    "Checklist Teares",
    "Procedimento de Segurança NR12",
    "Procedimento de Trabalho em Altura",
    "Procedimento de Bloqueio de Energia"
  ];
  const categories = [
    ProcedureCategory.SEGURANCA,
    ProcedureCategory.MECANICA,
    ProcedureCategory.ELETRICA,
    ProcedureCategory.LUBRIFICACAO,
    ProcedureCategory.PCM,
    ProcedureCategory.OPERACIONAL,
    ProcedureCategory.OUTROS
  ];

  for (let index = 0; index < 56; index += 1) {
    await prisma.procedure.create({
      data: {
        title: `${titles[index % titles.length]} ${String(Math.floor(index / titles.length) + 1).padStart(2, "0")}`,
        description: "Procedimento operacional ativo para padronização das rotinas de manutenção industrial.",
        category: categories[index % categories.length],
        version: "1.0",
        fileUrl: `/procedimentos/procedimento-${String(index + 1).padStart(2, "0")}.pdf`,
        active: true,
        responsible: seedOwner
      }
    });
  }
}

async function seedAlerts(equipment: Record<string, { id: string }>) {
  const alerts = [
    ["Ponte Rolante Principal", "Vibração acima do normal", AlertType.VIBRACAO, Priority.CRITICA],
    ["Compressor Atlas Copco", "Pressão instável", AlertType.PRESSAO, Priority.ALTA],
    ["Politriz Automática P36", "Temperatura elevada", AlertType.TEMPERATURA, Priority.CRITICA],
    ["Serra Monofio 01", "Equipamento parado", AlertType.EQUIPAMENTO_PARADO, Priority.CRITICA],
    ["Teares Breton Z400", "Quebra recorrente", AlertType.QUEBRA_RECORRENTE, Priority.CRITICA],
    ["Ponte Rolante Principal", "Estoque baixo", AlertType.ESTOQUE_BAIXO, Priority.ALTA],
    ["Teares Breton Z400", "Compra de rolamento atrasada", AlertType.COMPRA_ATRASADA, Priority.ALTA]
  ] as const;

  for (const [equipmentName, title, type, severity] of alerts) {
    await prisma.alert.create({
      data: {
        title,
        description: `${equipmentName} - ${title}`,
        type,
        severity,
        status: AlertStatus.ABERTO,
        equipmentId: equipment[equipmentName].id
      }
    });
  }
}

async function seedTimeEntries(users: Record<string, { id: string }>, serviceOrders: Array<{ id: string; osNumber: string }>) {
  const entries = [
    ["João Silva", 42],
    ["Carlos Ferreira", 38],
    ["Marcos Paulo", 35],
    ["José Santos", 28],
    ["Rafael Lima", 24]
  ] as const;

  for (let index = 0; index < entries.length; index += 1) {
    const [userName, hours] = entries[index];
    await prisma.timeEntry.create({
      data: {
        userId: users[userName].id,
        userName,
        serviceOrderId: serviceOrders[index].id,
        osNumber: serviceOrders[index].osNumber,
        workDate: mayDate(20 + index, 8),
        hours,
        weeklyGoal: 40,
        monthlyGoal: 176,
        observation: "Seed dashboard horas"
      }
    });
  }
}

async function seedSystemConfig() {
  const configs = [
    ["meta_horas_semanal", "40", "Meta semanal de horas por técnico"],
    ["meta_horas_mensal", "176", "Meta mensal de horas por técnico"],
    ["dias_os_atrasada", "7", "Dias para considerar uma OS atrasada"],
    ["limite_quebras_mes", "3", "Limite mensal para alerta de quebra recorrente"],
    ["periodo_dashboard_padrao", "2024-05", "Período padrão do dashboard"]
  ] as const;

  for (const [key, value, description] of configs) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description }
    });
  }
}

async function seedImportHistory() {
  const imports = [
    [ImportType.ORDENS_SERVICO, "importacao_ordens_servico_maio_2024.xlsx", 156, 156, 0, 0],
    [ImportType.COMPRAS, "importacao_compras_maio_2024.xlsx", 23, 23, 0, 0],
    [ImportType.LUBRIFICANTES, "importacao_lubrificantes_maio_2024.xlsx", 14, 14, 0, 0],
    [ImportType.HORAS_APONTADAS, "importacao_horas_maio_2024.xlsx", 5, 5, 0, 0]
  ] as const;

  for (const [type, fileName, totalRows, createdRows, updatedRows, errorRows] of imports) {
    await prisma.importHistory.create({
      data: { type, fileName, importedBy: seedOwner, totalRows, createdRows, updatedRows, errorRows, status: ImportStatus.SUCESSO }
    });
  }
}

async function reportCounts() {
  return {
    User: await prisma.user.count(),
    Equipment: await prisma.equipment.count(),
    ServiceOrder: await prisma.serviceOrder.count(),
    Purchase: await prisma.purchase.count(),
    Material: await prisma.material.count(),
    MaterialMovement: await prisma.materialMovement.count(),
    Lubricant: await prisma.lubricant.count(),
    LubricantMovement: await prisma.lubricantMovement.count(),
    Procedure: await prisma.procedure.count(),
    Alert: await prisma.alert.count(),
    TimeEntry: await prisma.timeEntry.count(),
    SystemConfig: await prisma.systemConfig.count(),
    ImportHistory: await prisma.importHistory.count()
  };
}

async function main() {
  await cleanGeneratedSeedData();
  const users = await seedUsers();
  const equipment = await seedEquipment();
  const serviceOrders = await seedServiceOrders(equipment);

  await seedPurchases(equipment);
  await seedMaterials(equipment);
  await seedLubricants(equipment);
  await seedProcedures();
  await seedAlerts(equipment);
  await seedTimeEntries(users, serviceOrders);
  await seedSystemConfig();
  await seedImportHistory();

  const counts = await reportCounts();
  console.log("Seed concluído com segurança:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`- ${table}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
