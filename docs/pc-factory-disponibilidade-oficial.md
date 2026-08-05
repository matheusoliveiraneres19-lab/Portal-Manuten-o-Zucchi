# Disponibilidade oficial do PC-Factory

> **Fonte da verdade:** planilha do negócio `disponibilidade mensal exportado.xlsx`
> (aba `ag-grid`), que replica o relatório nativo **G0134 — Indicadores de Manutenção
> OEE** do PC-Factory. Recebida em 2026-08-05.

## A fórmula

```
Disponibilidade = (G0134.LOADTIME − (Tempo de Manutenção + Tempo Ag. Manutenção)) / G0134.LOADTIME × 100
```

É exatamente o que as células da planilha fazem (colunas L, M, N, O):

| Célula | Fórmula | Significado |
|---|---|---|
| `L2` | `=D2+E2` | Tempo de Manutenção + Tempo Ag. Manutenção |
| `M2` | `=L2/C2` | ÷ G0134.LOADTIME |
| `N2` | `=M2*100` | em % |
| `O2` | `=100-N2` | **Disponibilidade** |

## Como isso vira código

No portal a fonte de dados é o histórico de status (`PcFactoryRecord`), não a planilha.
O equivalente de cada termo:

| Planilha | Portal |
|---|---|
| `G0134.LOADTIME` | `availabilityBreakdown(agg).operationalHours` = Tempo de Carga − Paradas Planejadas |
| `Tempo de Manutenção` + `Tempo Ag. Manutenção` | `agg.maintenanceHoursInOperational` |
| `Disponibilidade` | `availability(agg)` |

Onde o Tempo de Carga é:

```
Tempo de Carga = total − Fora de Turno − Recurso Não Programado
```

Sai da Carga apenas o tempo em que a máquina não estava programada para produzir.

### O tempo não apontado fica DENTRO da Carga

`Aguardando lançamento` (0008) e `Parada não Identificada` (0002) formam o bucket
`NAO_APONTADO`: 111.818 h no histórico de jan–jul/2026 (90.689 h de apontamentos abertos
— alguns com 625 h numa linha só — e 21.129 h de parada sem causa atribuída).

Por decisão do gestor em 2026-08-05 esse tempo **permanece no Tempo de Carga**. A
consequência precisa estar clara: como a regra G0134 desconta **somente manutenção**,
esse tempo desconhecido entra na conta como tempo **disponível** e empurra o indicador
para cima.

| Tempo não apontado | Disponibilidade (jan–jul/2026) |
|---|---|
| Dentro da Carga (regra atual) | **89,60 %** |
| Fora da Carga | 74,25 % |

O bucket continua existindo para que o volume apareça no painel de qualidade e no
resultado da importação, em vez de desaparecer dentro da conta. Quanto maior essa fatia,
menos o indicador fala sobre a máquina e mais sobre a falta de apontamento.

**Fonte única:** `calculateG0134BusinessAvailability()` em
`src/utils/pc-factory-normalizer.ts`. Toda Disponibilidade do módulo passa por ela:
card principal, tabela Confiabilidade por Máquina, ranking, evolução mensal, detalhes
por máquina, Máquinas Críticas da home e Máquinas abaixo da média. **Não criar regra
paralela.**

## Agregação: sempre ponderada

A Disponibilidade de um recorte (mês, linha, grupo, geral) é calculada sobre as horas
**somadas** do recorte — nunca como média das disponibilidades das máquinas. A diferença
é grande; na planilha, para janeiro:

| | |
|---|---|
| Ponderada pelos totais | **89,06 %** |
| Média simples das 33 máquinas | 84,28 % |

Em código isso é automático: `availability(agg)` recebe o agregado já somado.

## Não confundir com

### Utilização

```
Utilização = Tempo Trabalhado / Tempo Operacional × 100
```

Desconta **todas** as paradas não planejadas, não só manutenção. Era a fórmula que o
portal usava e chamava (erradamente) de "Disponibilidade". O PC-Factory mostra as duas
métricas em colunas separadas no G0007, aba Indicadores.

Continua disponível como `utilizationPercent` (em
`PcFactoryAvailabilityBreakdown` e na auditoria do painel de qualidade), apenas para
comparação. **Não rotular como Disponibilidade.**

### DTM [%] nativo do G0134

Desconta só `Tempo de Manutenção`, **sem** `Tempo Ag. Manutenção`. Por isso é sempre
maior que a Disponibilidade. Na primeira linha da planilha:

| | |
|---|---|
| `DTM [%]` | 96,44 % |
| `Disponibilidade` | 94,83 % |

A planilha do negócio desconta os dois, e o portal segue a planilha. **`DTM [%]` não é
usado como disponibilidade final.**

## Manutenção Planejada (0207): por que não entra no numerador

`Manutenção Planejada` está na categoria `MANUTENCAO`, mas seu bucket de disponibilidade
é `PARADA_PLANEJADA` — ou seja, já foi retirada do **denominador** (Tempo Operacional =
Carga − Paradas Planejadas). Somá-la também no numerador subtrairia o mesmo tempo duas
vezes.

Por isso existem dois campos distintos no agregado:

- `maintenanceHours` — todas as horas de manutenção. Alimenta o card "Horas de
  manutenção", MTTR, MTBF e a composição da manutenção.
- `maintenanceHoursInOperational` — só a manutenção **dentro** do Tempo Operacional.
  É o numerador da Disponibilidade.

No histórico de jan–jul/2026 a diferença é de 31,2 h (0,04 pp) — pequena, mas a conta
está certa.

## Auditoria

O painel "Qualidade da importação" da aba tem uma seção expansível **"Como a
Disponibilidade é calculada (base G0134)"** com `operationalHours`,
`maintenanceHours`, `waitingMaintenanceHours`, o resultado e a Utilização para
comparação. Os mesmos campos estão em `PcFactoryDataQuality.availabilityAudit`, para
conferir contra as colunas `G0134.LOADTIME`, `Tempo de Manutenção`,
`Tempo Ag. Manutenção` e `Disponibilidade` da planilha.

## Validação da fórmula

Três linhas da planilha (JAN), conferidas contra
`calculateG0134BusinessAvailability()` — delta zero em 12 casas decimais:

| Recurso | LOADTIME | Manutenção | Ag. Manutenção | Planilha | Portal |
|---|---|---|---|---|---|
| LV02-G03 | 15,0624884259 | 0,4063888889 | 0,4145370370 | 94,5498651835 % | 94,5498651835 % |
| LV01-G03 | 8,1865625000 | 0,1462847222 | 0,2010879630 | 95,7567943177 % | 95,7567943177 % |
| PZ04-G08 | 2,6395717593 | 0,0500115741 | 0,6075810185 | 75,0871485010 % | 75,0871485010 % |

Disponibilidade mensal ponderada da planilha, reproduzida pela fórmula do portal
(tolerância exigida: 0,1 pp):

| Mês | Máquinas | LOADTIME | Ponderada |
|---|---|---|---|
| JAN | 33 | 850,6 | 89,06 % |
| FEV | 25 | 318,6 | 58,09 % |
| MAR | 30 | 440,6 | 74,81 % |
| ABR | 30 | 379,3 | 76,33 % |
| MAI | 30 | 377,8 | 83,29 % |
| JUN | 37 | 436,8 | 86,11 % |

As 5 linhas da planilha com `MÊS` vazio são consolidados gerais e ficam fora da série
mensal, para não duplicar. No portal esse caso não existe: a evolução mensal agrupa por
`startDateTime` e registros sem data já são descartados.

## Histórico das mudanças de regra

| Data | Regra | Por quê mudou |
|---|---|---|
| até 2026-08-04 | `(Planejado − paradas) / Planejado` | — |
| 2026-08-04 (`690203a`) | `Trabalhado / Operacional` | tentativa de "regra oficial" |
| 2026-08-04 (`dc793cf`) | revertido para a anterior | dava 55,91 %, inutilizável; base de tempo estava quebrada (`durationHours = 24` em todos os registros) |
| 2026-08-05 | base de tempo corrigida | o bug era `converterNumeroBrasileiro("8.3333") → 83333` no import do CSV |
| 2026-08-05 | `0008` e `0002` fora do Tempo de Carga | tempo sem apontamento não é parada medida |
| 2026-08-05 | regra da planilha G0134 | o negócio já reportava Disponibilidade por essa fórmula; o portal passou a segui-la |
| **2026-08-05 (atual)** | **`0008` e `0002` de volta para dentro da Carga** | decisão do gestor. Sob a G0134 só a manutenção é descontada, então o indicador vai de 74,25 % para 89,60 % — perto dos 89,06 % de JAN na planilha e dos ~90 % que o `28a44f4` registra como aderentes ao PC-Factory |

## Base de tempo

`durationHours` (Tempo Decorrido) é a base oficial, alinhada à Management View.
`realDurationHours` fica **apenas como auditoria** e nunca substitui `durationHours` —
não existe fallback `realDurationHours ?? durationHours` no cálculo.
