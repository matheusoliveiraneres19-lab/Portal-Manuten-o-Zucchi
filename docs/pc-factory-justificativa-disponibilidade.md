# PC-Factory — Tabela gerencial de disponibilidade + Justificativa de baixa disponibilidade

> Implementado em 2026-09-21. Simplifica a seção **Confiabilidade por Máquina** de
> `/dashboard/pc-factory` para a leitura gerencial da **Disponibilidade Física** e
> acrescenta a justificativa manual por **máquina + período**.

## 1. A tabela

De sete colunas para quatro:

```text
MÁQUINA | HORAS DE PARADA | DISPONIBILIDADE | MOTIVO / JUSTIFICATIVA
```

**Saíram da tabela:** `Quebras`, `MTBF`, `MTTR`, `MTTA`.
**Não saíram do sistema.** Continuam sendo calculados em `pc-factory.service`
(`buildMachineAvailabilityMetrics`) e continuam visíveis/consumidos em:

| Consumidor | O que usa |
|---|---|
| `PcFactoryDetailsDrawer` | MTTR gerencial no painel da máquina |
| `getPcFactoryDashboardKPIs` / `PcFactoryKpiCards` | `kpis.mttr`, `kpis.mtbf`, `kpis.mtta` |
| `getPcFactoryResourceDetails` | MTTR/MTBF/MTTA do recurso |
| `scripts/validate-pcfactory-availability.ts` | invariantes de MTBF/MTTR/MTTA |
| `scripts/audit-pc-factory-reliability.ts` | auditoria de confiabilidade |

Por isso **não há código morto a limpar**: a pesquisa de consumidores (requisito 1)
mostrou que os três indicadores são usados fora desta tabela. `PcFactoryReliabilityRow`
mantém os campos.

`HORAS DE PARADA` é a antiga coluna `PARADAS`, renomeada. O valor é
`row.downtimeHours`, que é **o mesmo número que a fórmula subtrai** do Tempo Total
(`maintenanceDowntimeHours` = os seis subtipos de manutenção) — não existe segundo
total calculado para a tela.

A fórmula não mudou:

```text
Disponibilidade Física = (Tempo Total do Período − Horas de Parada) ÷ Tempo Total × 100
```

Ordenação ASC/DESC por Máquina, Horas de Parada e Disponibilidade, **sempre antes da
paginação**. Todas as máquinas válidas do recorte continuam acessíveis (25/50/100/todas
por página) — nenhum `slice` de Top N.

## 2. Justificativa — modelo de dados

```prisma
model PcFactoryAvailabilityNote {
  id, resourceName, resourceCode?,
  periodStart @db.Date, periodEnd @db.Date,
  reason, actionPlan?, responsible?,
  availabilitySnapshot?, downtimeHoursSnapshot?,
  createdById?, createdByName?, createdAt,
  updatedById?, updatedByName?, updatedAt
  @@unique([resourceName, periodStart, periodEnd])
}
```

**Chave: máquina + período.** `resourceName` é a chave canônica do módulo — é por ele
que `groupRecordsByMachine` agrupa e é o que a linha manda para o painel de detalhes.
`resourceCode` existe em `PcFactoryRecord` mas vem majoritariamente nulo na base
importada, então viaja junto apenas como identificação auxiliar, nunca como chave.

O período é a **janela resolvida** (`PcFactoryPageData.periodWindow`), não o
`reference`: `reference` vem vazio quando a tela está sem filtro de data, e a chave
precisa existir sempre.

`availabilitySnapshot` / `downtimeHoursSnapshot` são uma FOTO informativa do que o
gestor via ao escrever, para o futuro "Relatório de Baixa Disponibilidade". **Não são
fonte de verdade**: a tela e os relatórios recalculam sempre a partir dos registros.

### O motivo nunca entra em cálculo

`reason`, `actionPlan` e `responsible` são texto gerencial. `pc-factory-availability-notes.service`
não lê `PcFactoryRecord`, não soma horas e não deriva percentual.
`npm run validate:pc-factory-notes` compara Horas de Parada, Tempo Total e
Disponibilidade antes e depois de salvar/editar — têm de ser idênticos.

## 3. Interface

- Coluna MOTIVO: sem justificativa → `+ Registrar motivo`; com justificativa →
  resumo em **2 linhas** (`line-clamp-2`, tooltip com o texto inteiro) + `Ver / Editar`.
  Em tela pequena o resumo some e fica só `Ver motivo` — sem rolagem horizontal nova.
- Clicar abre um **painel horizontal logo abaixo da linha**, ocupando a largura inteira
  da tabela, no escuro da identidade Zucchi (preto/grafite, dourado, bege). Mostra
  disponibilidade, horas de parada, tempo total e período (só leitura — o painel repete
  os valores da linha, não recalcula), os três campos e o **histórico de justificativas**
  da máquina.
- Badge `⚠ Justificativa pendente` quando a disponibilidade está abaixo de **70%** e não
  há justificativa no período; `✓ Justificado` quando há. O corte de 70% **não é novo**:
  é o mesmo de `buildRecommendations` ("baixa disponibilidade estimada") e o mesmo do
  vermelho da célula, agora nomeado em `PHYSICAL_AVAILABILITY_BANDS`.

## 4. Permissões e auditoria

Escrita: `AVAILABILITY_NOTE_WRITE_ROLES = ["ADMIN", "GESTOR"]` — os mesmos papéis do
enum `Role` que a Central de Procedimentos já usa. Nenhum papel novo, nenhum sistema de
autenticação novo. Qualquer usuário autenticado **visualiza**.

A trava existe nos dois lados: a rota da página resolve `canEditAvailabilityNotes` pela
sessão (decide o que a tela oferece) e `POST /api/pc-factory/availability-notes` revalida
com `requireRole` (decide o que o servidor aceita).

Auditoria: `createdBy*`/`updatedBy*` na própria linha — a autoria original é preservada
na edição — mais um registro em `AuditLog`
(`registrar_justificativa_disponibilidade` / módulo `pc_factory`).

## 5. Arquivos

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | + model `PcFactoryAvailabilityNote` |
| `prisma/migrations/20260921000000_add_pcfactory_availability_notes/` | CREATE TABLE aditivo e idempotente |
| `src/types/pc-factory-availability-note.ts` | **novo** — DTO, input, papéis de escrita, limites |
| `src/services/pc-factory-availability-notes.service.ts` | **novo** — leitura/escrita; não calcula nada |
| `src/app/api/pc-factory/availability-notes/route.ts` | **novo** — GET (período/histórico) e POST (upsert) |
| `src/utils/pc-factory-physical-availability.ts` | + `PHYSICAL_AVAILABILITY_BANDS` / `classifyPhysicalAvailability` (as faixas que já existiam, agora nomeadas) |
| `src/types/pc-factory.ts` | + `PcFactoryPeriodWindowDTO`, `periodWindow` e `availabilityNotes` em `PcFactoryPageData` |
| `src/services/pc-factory.service.ts` | + `toPeriodWindowDTO`, carga das justificativas (tolerante a falha) |
| `src/components/pc-factory/PcFactoryReliabilityTable.tsx` | 4 colunas, coluna de motivo, painel expansível, histórico |
| `src/components/pc-factory/PcFactoryPage.tsx` / `src/app/dashboard/pc-factory/page.tsx` | passam período, justificativas e permissão |
| `src/types/audit.ts` | + ação `registrar_justificativa_disponibilidade`, módulo `pc_factory` |
| `scripts/validate-pcfactory-availability-notes.ts` | **novo** — teste funcional ponta a ponta |

## 6. Runbook

> ⚠️ Banco criado por migrations do **Supabase**. **NÃO** use `prisma migrate reset`
> (destrutivo) nem `migrate deploy`. O pooler (`:6543`) está bloqueado nesta rede — use
> a conexão direta (`DIRECT_URL`).

```bash
npx prisma validate
npx prisma generate

# Aplicar a migration (CREATE TABLE IF NOT EXISTS — aditivo, idempotente)
DATABASE_URL="$(grep -E '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')" \
  npx prisma db execute \
    --file prisma/migrations/20260921000000_add_pcfactory_availability_notes/migration.sql \
    --schema prisma/schema.prisma

# Teste funcional (escreve e limpa só na tabela de justificativas)
DATABASE_URL="$(grep -E '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')" \
  npx tsx --env-file=.env scripts/validate-pcfactory-availability-notes.ts \
    --machine="Multifio 01 - Gasp"
```

Nenhum dado existente é apagado: a migration só cria tabela nova.

Se o código subir antes da migration, a aba **não quebra** — a carga das justificativas
é tolerante a falha e a tabela aparece sem a coluna preenchida.
