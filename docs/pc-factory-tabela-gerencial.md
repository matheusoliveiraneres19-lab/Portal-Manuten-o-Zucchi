# PC-Factory — Tabela Gerencial (Management View)

> Implementado em 2026-06-24. Alinha o módulo `/dashboard/pc-factory` à **Tabela Gerencial
> (Management View) do PC-Factory**: classificação por **código `RCODSTATUS`** em 6 grupos,
> base de tempo **"Tempo Decorrido"** e KPI de manutenção redefinido.

## 1. Por que mudou ("nada batia")

O portal não batia com a Tabela Gerencial do PC-Factory por **3 motivos estruturais**:

1. **Classificação diferente** — o portal usava 7 categorias próprias por *nome* de status; o
   PC-Factory agrupa em **6 grupos por código** (`G0015.RCODSTATUS`).
2. **Definição de Manutenção** — o portal contava só 4 status (excluía Terceiros, separava
   Aguardando); o PC-Factory inclui os **6 status do grupo "Manutenção"** (códigos `02xx`).
3. **Base de tempo** — o portal calculava tudo sobre **"Tempo Decorrido Real"**; a Tabela
   Gerencial usa **"Tempo Decorrido"**.

Além disso, o export `ag-grid` **não traz** a coluna "Nome Grp. Status" — o grupo precisa ser
**derivado do código**, e o importador antigo **ignorava** o `RCODSTATUS`.

## 2. Mapa oficial status → grupo (confirmado pelo gestor)

A fonte da verdade é o **código `RCODSTATUS`**, não o nome. Mapa em
`src/utils/pc-factory-normalizer.ts` (`MANAGEMENT_GROUP_BY_CODE` / `classifyManagementGroup`).

| Grupo | Códigos | Status |
|---|---|---|
| **Padrão do Sistema** | `0001 0002 0004 0008 0009` | Produção, Parada não Identificada, Fora de Turno, Aguardando lançamento, Recurso Não Programado |
| **Manutenção** | `0200 0201 0202 0206 0207 0208` | Aguardando Manutenção, Mecânica, Elétrica, Automação, Planejada, de Terceiros |
| **Operacional** | `03xx 05xx 0612 07020` | Acidente, Aguard. Carro, Ausência Operador, Limpeza, Falta de Espaço, Quebra de Chapa, Refeição, Start Check List, Inspeção, Resina Mole, Deslocamento, Reunião, Confraternizações, **Revezamento**, **Quebra de Ferramenta** |
| **Materiais** | `0401 0403 00070` | Falta de Material, Falta de Carrinho, **Falta de Utilidades** |
| **Setup** | `06100 06110 06120 06130 06140 06150 0603` | Setup-Serrad/Bifios/PZs/Resina/Envelop/Tratam, **Medição de Abrasivos** |
| **Externo** | — | (sem status nos dados atuais; provável "Acidente" — a confirmar) |

> ⚠️ O agrupamento **não é só o prefixo** do código. Casos confirmados que fogem do prefixo:
> Falta de Utilidades (`00070`) → Materiais; Quebra de Ferramenta (`07020`) → Operacional;
> Medição de Abrasivos (`0603`) → Setup; Revezamento (`0612`) → Operacional.
> Códigos novos não mapeados caem numa heurística por prefixo (ver `classifyManagementGroup`).

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | + colunas `statusCode` e `managementGroup` (TEXT, nullable) em `PcFactoryRecord` |
| `src/utils/pc-factory-normalizer.ts` | `PcFactoryManagementGroup`, `MANAGEMENT_GROUP_BY_CODE`, `classifyManagementGroup()`, labels/ordem; **manutenção redefinida** para os 6 status `02xx` (novos kinds `PLANEJADA` e `TERCEIROS`) |
| `src/services/importacao/pc-factory-import.service.ts` | mapeia `G0015.RCODSTATUS` → `statusCode`; grava `managementGroup` |
| `src/services/pc-factory.service.ts` | `metricHours` → **`durationHours` (Tempo Decorrido)**; `buildManagementTable()` / `getPcFactoryManagementTable()`; split de manutenção com 6 tipos |
| `src/types/pc-factory.ts` | `PcFactoryManagementGroupRow`, `managementTable` em `PcFactoryPageData`, `statusCode` em `PcFactoryExcelRow` |
| `src/constants/pc-factory-colors.ts` | `PC_FACTORY_MANAGEMENT_GROUP_COLORS` + cores de Planejada/Terceiros |
| `src/components/pc-factory/PcFactoryManagementTable.tsx` | **novo** — tabela idêntica à do PC-Factory |
| `src/components/pc-factory/PcFactoryManagementChart.tsx` | **novo** — donut dos 6 grupos |
| `src/components/pc-factory/PcFactoryPage.tsx` | usa o donut dos 6 grupos no lugar do antigo (7 categorias) |
| `src/components/pc-factory/PcFactoryMaintenanceSplitChart.tsx` | título/legenda atualizados (6 tipos) |
| `prisma/migrations/20260624000000_pcfactory_status_code_group/` | SQL da migration (histórico) |
| `scripts/verify-pc-factory-groups.ts` | valida os grupos de um `.xlsx` usando o código de produção |

## 4. Runbook (migration + reimport)

> ⚠️ Banco criado por migrations do **Supabase** (não Prisma). **NÃO** use `prisma migrate
> deploy/dev` (destrutivo aqui). O **pooler (`:6543`) está bloqueado** nesta rede — use a
> **conexão direta** (`DIRECT_URL`) para scripts de runtime.

```bash
# 0. Regenerar o client (lê só o schema, não toca no banco)
npx prisma generate

# 1. Aplicar a migration (ALTER TABLE ADD COLUMN, idempotente) via conexão direta
npx prisma db execute --file prisma/migrations/20260624000000_pcfactory_status_code_group/migration.sql --schema prisma/schema.prisma

# 2. Reimportar (APAGA e recarrega PcFactoryRecord). Forçar conexão direta:
DATABASE_URL="$(grep -E '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')" \
  npx tsx scripts/reset-pc-factory.ts "caminho/do/arquivo.xlsx"

# 3. Validar a classificação de qualquer .xlsx sem tocar no banco
npx tsx scripts/verify-pc-factory-groups.ts "caminho/do/arquivo.xlsx"
```

Alternativa para o passo 1: aplicar o SQL pelo **Supabase MCP `apply_migration`** ou pelo SQL Editor.

## 5. Validação (export G0015, 01/05–22/06/2026)

Resultado no banco após o reimport (17.377 registros, 0 com grupo nulo):

| Grupo | % | Tempo Decorrido |
|---|---|---|
| Padrão do Sistema | 82,59% | 43.144h |
| Setup | 9,71% | 5.070h |
| Manutenção | 4,47% | 2.336h |
| Operacional | 2,42% | 1.266h |
| Materiais | 0,80% | 419h |

Para bater com o "Período Consolidado" da imagem original (Jan–Jun), exportar o **período
completo com todos os status** e rodar o reimport (passo 2) com esse arquivo.

## 6. Pontos em aberto

- **Grupo "Externo"**: sem status nos dados atuais. Se o PC-Factory mostrar Externo > 0,
  identificar o status (provável "Acidente", código `0301`) e ajustar `MANAGEMENT_GROUP_BY_CODE`.
- **`next dev` no OneDrive**: roda de uma cópia fora do OneDrive para evitar o bug conhecido.
- As 7 categorias antigas (`statusCategory`) continuam no banco/serviço para compatibilidade;
  a UI principal agora mostra os 6 grupos.
