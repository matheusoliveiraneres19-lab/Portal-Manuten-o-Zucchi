# Arquitetura de Dados — Portal de Gestão da Manutenção Zucchi

Este documento descreve como os dados fluem no portal e como manter dashboard e
páginas internas sempre coerentes (uma única fonte de verdade).

---

## 1. Fonte única da verdade

A fonte de verdade é **o banco, acessado via Prisma**. Nenhuma página lê arrays
mockados como dado principal.

As **regras de negócio** que definem "o que conta como X" vivem em um único lugar:

- `src/services/shared/portal-rules.ts` — constantes de status/criticidade/limiares:
  - `OPEN_SERVICE_ORDER_STATUSES` = `ABERTA, LIBERADA, EM_ANDAMENTO, AGUARDANDO_MATERIAL`
  - `PENDING_PURCHASE_STATUSES` = `SOLICITADA, EM_COTACAO, APROVADA, ATRASADA`
  - `CRITICAL_PRIORITIES` = `ALTA, CRITICA`
  - `CRITICAL_EQUIPMENT_CRITICALITIES` = `ALTA, CRITICA`
  - `BREAKDOWN_MAINTENANCE_TYPES` = `CORRETIVA`
  - `CRITICALITY_SCORE_THRESHOLD` (70) / `ATTENTION_SCORE_THRESHOLD` (40) / `CRITICALITY_WEIGHTS`
- `src/utils/date-range.ts` — helpers de data em UTC (`toStartOfDay`, `toEndOfDay`,
  `withinPeriod`, `isWithinPeriod`, `dayKey`, `monthRange`, `yearRange`).

> ⚠️ Nunca redefina esses conjuntos/limiares inline em um service ou componente.
> Se a regra mudar, muda **só** em `portal-rules.ts` e todo o portal acompanha.

---

## 2. Quais tabelas alimentam cada indicador

| Indicador | Tabela(s) | Regra |
|---|---|---|
| OS Abertas | `ServiceOrder` | `status ∈ OPEN_SERVICE_ORDER_STATUSES` |
| OS abertas x fechadas | `ServiceOrder` | abertura por `openedAt`, fechamento por `closedAt` + `FECHADA` |
| Corretiva x Preventiva | `ServiceOrder.type` | `CORRETIVA` / `PREVENTIVA` no período |
| Top equipamentos críticos | `ServiceOrder` + `Equipment` | volume de OS de equipamentos críticos |
| Top máquinas (índice de quebra) | `ServiceOrder` | proporção de OS `CORRETIVA` por equipamento |
| Compras Pendentes | `Purchase` | `status ∈ PENDING_PURCHASE_STATUSES` |
| Compras por mês | `Purchase` | soma de `totalValue` por mês |
| Consumo Lubrificantes | `LubricantMovement` | soma de `absoluteQuantity` onde `movementCategory = SAIDA` |
| Materiais mais utilizados | `MaterialMovement` | materiais com `SAIDA` no período |
| Procedimentos Ativos | `Procedure` | `active = true` |
| Alertas Críticos | `Alert` | `status = ABERTO` e `severity ∈ CRITICAL_PRIORITIES` |
| Horas por colaborador | `TimeEntry` (→ fallback `ServiceOrder.workedHours`) | soma de horas por responsável |
| Máquinas Críticas (cadastro) | `Equipment` | `criticality ∈ CRITICAL_EQUIPMENT_CRITICALITIES` |

---

## 3. Como cada página consome dados

Todas as páginas são **Server Components** com `export const dynamic = "force-dynamic"`,
ou seja, consultam o banco a cada navegação/refresh.

```
Página (server)  →  Service do domínio  →  Prisma  →  Banco
       ↑                    ↑
  searchParams        portal-rules + date-range (regras únicas)
```

Camadas de service:

- **Services de domínio** (folhas): `purchases`, `materials`, `alerts`,
  `time-entries`, e os de `service-orders`, `critical-equipments`, `lubricants`.
- **Agregador**: `src/services/portal-analytics.service.ts` →
  `getPortalAnalytics(period)` compõe, num único `Promise.all`, os indicadores de
  todos os domínios para o **mesmo período**, reaproveitando exatamente as mesmas
  funções (sem recálculo, sem divergência).
- **Dashboard**: `dashboard.service.ts` monta o objeto visual do dashboard a
  partir dos mesmos services de domínio.

Regras:
1. Componentes visuais **não** calculam regra de negócio pesada.
2. Componentes recebem dados já tratados.
3. Cálculos ficam nos services.
4. Mock só existe como **fallback controlado** (`src/data/dashboard.ts`), nunca
   como dado principal — e é claramente identificado (`source: "mock"`).

---

## 4. Como importações atualizam o portal

1. A importação grava no banco (ex.: `LubricantMovement`, `ServiceOrder`).
2. Registra a importação em `ImportHistory`.
3. O client chama **`usePortalDataRefresh()`** (`src/hooks/usePortalDataRefresh.ts`),
   que dispara `router.refresh()`.
4. Como as páginas são `force-dynamic`, o server component re-executa e reconsulta
   os services centralizados → dashboard e página atual refletem os novos dados,
   sem reload completo e **sem precisar alterar página por página**.

```ts
const { refresh } = usePortalDataRefresh();
// após importar:
refresh({ toastMessage: null }); // o modal já mostrou seu próprio toast
```

---

## 5. Como funciona o período global

- Armazenado na **URL** (`?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`).
- Cliente: `useDashboardPeriod()` + `PeriodFilter` (header) leem/escrevem a URL.
- Servidor: cada página lê `searchParams` e repassa aos services.
- Propaga para: dashboard, Ordens de Serviço, Equipamentos Críticos e
  **Lubrificantes** (quando há `startDate/endDate` e o usuário não fixou ano/mês,
  a janela global define o mês/ano de referência — ver `resolveLubricantReference`).
- Alguns KPIs são "snapshot" por natureza (cadastro de equipamentos críticos,
  procedimentos ativos) e não dependem do período.

---

## 6. Como evitar números hardcoded

- KPIs sem dados → exibem "0" com estado vazio (`isEmpty`) e o aviso
  ("Aguardando importação" / "Sem registros no período").
- Gráficos/tabelas sem dados → **empty state** do próprio card.
- O fallback (`src/data/dashboard.ts`) tem KPIs "0" e listas/gráficos **vazios** —
  nunca séries com números inventados.

---

## 7. Como criar um novo indicador corretamente

1. Se envolve uma regra nova de "o que conta", adicione a constante em
   `portal-rules.ts` (não inline).
2. Implemente o cálculo no **service de domínio** correspondente (ou crie um).
3. Use os helpers de `date-range.ts` para filtrar por período.
4. Exponha o indicador no agregador `portal-analytics.service.ts` se for
   compartilhado entre páginas.
5. No componente, apenas **consuma** o dado já tratado e trate o estado vazio.

---

## 8. Como validar consistência entre dashboard e páginas internas

Siga `docs/checklist-consistencia-dados.md`. Em resumo: importe uma planilha e
confirme que o mesmo número aparece no dashboard e na página do módulo (ex.: "OS
Abertas" no dashboard == contagem de OS abertas na página de Ordens, pois ambos
usam `OPEN_SERVICE_ORDER_STATUSES`).
