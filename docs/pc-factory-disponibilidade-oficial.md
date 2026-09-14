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

| Planilha | Portal (recorte inteiro) | Portal (uma máquina) |
|---|---|---|
| `G0134.LOADTIME` | `availabilityBreakdown(agg).operationalHours` | `metrics.loadTimeHours` |
| `Tempo de Manutenção` | — (vem somado com o Aguardando) | `metrics.maintenanceHours` |
| `Tempo Ag. Manutenção` | `agg.waitingHours` | `metrics.waitingMaintenanceHours` |
| `Disponibilidade` | `availability(agg)` | `metrics.availabilityPercent` |

Os dois caminhos terminam na MESMA função pura:
`calculateMachineG0134Availability({ loadTimeHours, maintenanceHours, waitingMaintenanceHours })`.
`calculateG0134BusinessAvailability()` continua existindo para o agregado e hoje só
delega para ela (o `maintenanceHours` do agregado já inclui o Aguardando, então entra
com `waitingMaintenanceHours: 0`). **A divisão acontece num lugar só.**

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
| Dentro da Carga (regra atual) | **78,67 %** |
| Fora da Carga | 77,95 % |

Depois que os status abertos saíram das somas (ver a seção seguinte), o tempo não apontado
caiu de 111.818 h para **2.235 h** — 98 % dele eram justamente aqueles registros. Com esse
volume a diferença virou 0,72 pp, então a escolha de mantê-lo dentro ou fora da Carga
deixou de ser determinante. Antes da exclusão dos abertos, essa mesma escolha valia
15 pp (89,61 % contra 74,25 %).

O bucket continua existindo para que o volume apareça no painel de qualidade e no
resultado da importação, em vez de desaparecer dentro da conta. Quanto maior essa fatia,
menos o indicador fala sobre a máquina e mais sobre a falta de apontamento.

**Fonte única:** `calculateMachineG0134Availability()` em
`src/utils/pc-factory-normalizer.ts`. Toda Disponibilidade do módulo passa por ela:
card principal, tabela Confiabilidade por Máquina, ranking, evolução mensal, detalhes
por máquina, Máquinas Críticas da home e Máquinas abaixo da média. **Não criar regra
paralela.**

A função recebe HORAS e só horas. Ela não vê — e não pode passar a ver — MTTR, MTBF,
MTTA, quantidade de quebras ou eventos de manutenção. Esses indicadores aparecem ao lado
da Disponibilidade na tabela, nunca dentro dela.

### Uma máquina: `buildMachineAvailabilityMetrics()`

Em `src/services/pc-factory.service.ts`. Recebe os registros JÁ filtrados de UMA
máquina e devolve a decomposição inteira (Total → Carga → LOADTIME → manutenção →
disponibilidade) mais MTBF/MTTR/MTTA.

É a fonte única da linha da tabela **Confiabilidade por Máquina** E do painel lateral
**Detalhe da Máquina** — de propósito. Antes o painel montava os números por outro
caminho e, pior, consultava o histórico COMPLETO da máquina sem nenhum filtro: com a tela
em agosto/2026, a tabela mostrava 50,4% / 128,6 h e o painel da mesma máquina mostrava
54,5% / 1.188,8 h. Hoje `getPcFactoryResourceDetails(machine, params)` recebe os mesmos
`params` da tela e passa pelo mesmo `loadRecords()`; a rota `/api/pc-factory/details`
carrega período, modo, grupo, linha, máquina e status na query string (a máquina clicada
viaja em `machine`, para não colidir com o filtro `resource` da tela).

## Agregação: sempre ponderada

A Disponibilidade de um recorte (mês, linha, grupo, geral) é calculada sobre as horas
**somadas** do recorte — nunca como média das disponibilidades das máquinas. A diferença
é grande; na planilha, para janeiro:

| | |
|---|---|
| Ponderada pelos totais | **89,06 %** |
| Média simples das 33 máquinas | 84,28 % |

Em código isso é automático: `availability(agg)` recebe o agregado já somado.

## Status abertos saem das somas de horas

Um registro sem `endDateTime` é um status **aberto**: o PC-Factory nunca registrou a
mudança seguinte. A "duração" dele não é uma medição — é a distância entre o início e o
momento em que o arquivo foi exportado. Reexportar amanhã aumenta o número em 24 h.

Por isso `loadRecords()` aplica `MEASURABLE_DURATION` (`endDateTime is not null`) em
**toda** agregação por horas: KPIs, tendência, confiabilidade, rankings, composição,
Pareto de causas e detalhes por máquina. Os registros continuam gravados, aparecem na
tabela de registros e são contados no painel de qualidade — só não pesam nos indicadores.

No export de jan–jul/2026 eram **42 registros de 60.921 respondendo por 205.679 h**,
quase metade da base. Todos abriram em 05/01/2026 e nunca fecharam. Eles dominavam os
totais por status:

| Status | Máquinas | Horas | % do total daquele status |
|---|---|---|---|
| Aguardando lançamento | 18 | 89.698 | 98,9 % |
| Recurso Não Programado | 15 | 74.784 | 57,1 % |
| Parada não Identificada | 4 | 19.884 | 94,1 % |
| Fora de Turno | 4 | 13.958 | 16,0 % |
| **Manutenção Mecânica** | **1** | **4.986** | **34,3 %** |
| Produção | 1 | 4.928 | 9,3 % |

Efeito da exclusão:

| | antes | depois |
|---|---|---|
| Base de horas | 422.111 h | 216.431 h |
| Tempo de Carga | 204.103 h | 84.607 h |
| Não apontado | 111.818 h | 2.235 h |
| Manutenção mecânica | 14.532 h | 9.546 h |
| Máquina mais crítica | MULTFIO5 (artefato) | Multifio 04 - BM |
| **Disponibilidade** | 89,61 % | **78,67 %** |
| Carga de janeiro | 131.932 h | 12.436 h |

O ganho mais importante não é o número global: é que **os meses voltaram a ser
comparáveis**. Janeiro tinha 131.932 h de carga contra ~13.000 h dos outros porque
concentrava os status abertos; agora tem 12.436 h e 79,03 %.

**A correção de verdade é na origem:** fechar esses status no PC-Factory. Enquanto isso
não acontecer, cada novo export traz os mesmos registros com duração ainda maior.

### Máquinas com base de tempo mínima

Excluir os abertos deixa algumas máquinas com muito pouca hora medida, e aí o percentual
fica extremo sem ser representativo. `MULTFIO5` é o caso claro: fora o registro aberto,
tudo que existe dela são 12 registros de Manutenção Mecânica somando 96 h — nada de
produção. A disponibilidade dá 0 %, o que é a leitura correta desses 96 h, e a tabela de
confiabilidade marca a linha com o aviso "toda a base de tempo é manutenção (sem
produção) — MTBF/disponibilidade pouco representativos".

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

## Manutenção Planejada (0207): entra no numerador

`Manutenção Planejada` está na categoria `MANUTENCAO` e o bucket de disponibilidade dela
é `PARADA_NAO_PLANEJADA` — ela NÃO sai do denominador (só o Setup sai). Por isso entra
normalmente no numerador, junto com Mecânica, Elétrica, Automação e Terceiros.

Houve uma fase em que ela era `PARADA_PLANEJADA` e, por já estar fora do denominador,
precisava ficar fora do numerador; daí o antigo par
`maintenanceHours` / `maintenanceHoursInOperational`. Com a regra atual não há mais o que
separar, e o campo duplicado foi removido: **um número só** alimenta o card "Horas de
manutenção", a coluna Paradas da tabela e o numerador da Disponibilidade.

O que continua separado é outra coisa: a Planejada fica fora do **MTTR** e da contagem de
**quebras**, porque preventiva não é falha. Soma nas horas, não soma nos eventos.

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
| 2026-08-05 | `0008` e `0002` de volta para dentro da Carga | decisão do gestor |
| **2026-08-05 (atual)** | **status abertos (`endDateTime` nulo) fora das somas de horas** | 42 registros carregavam 205.679 h — quase metade da base — com duração que era artefato da janela do export. Indicador vai para **78,67 %** e os meses voltam a ser comparáveis |

## Quando o LOADTIME oficial vem como período cheio

O relatório publica, em algumas linhas, `G0134.LOADTIME` igual ao período inteiro —
31,0000 dias num mês de 31 —, ou seja, sem descontar nada. Acontece com máquinas
diferentes em meses diferentes (MF04 em FEV/MAI/JUN, MF06 em FEV, MF01 e MF02 em AGO), e
em janeiro três recursos aparecem com 154,63 dias, 499% do mês.

Em agosto/2026 isso explica as duas divergências que restam:

| Máquina | LOADTIME oficial | LOADTIME derivado | Oficial | Portal |
|---|---|---|---|---|
| Multifio 02 - Gasp | 744,00 h (mês cheio) | 259,04 h | 82,71 % | 50,36 % |
| Multifio 01 - Gasp | 744,00 h (mês cheio) | 314,26 h | 93,20 % | 83,91 % |

As horas de manutenção batem exatamente nas duas (26,28 + 24,27 h na MF01 contra
26,29 + 24,28 h do relatório), então é a mesma extração. O que não bate é o denominador:
o relatório diz que a máquina esteve programada 100% do mês enquanto o próprio export traz
**399,77 h** (MF01) e **483,36 h** (MF02) de "Recurso Não Programado" apontadas em blocos
normais de turno, 57 e 63 registros.

O portal deriva o LOADTIME do histórico importado e por isso **não reproduz** esses dois
números. A correção é na origem: fechar o calendário desses recursos no PC-Factory. Nas
outras 23 máquinas comparadas de agosto a diferença é menor que 1 p.p. e vem de as duas
extrações não terem saído no mesmo instante.

## Varredura contra a planilha oficial

```bash
npm run validate:pc-factory-machines -- "disponibilidade mensal exportado.xlsx" --month 2026-08
```

Compara TODAS as máquinas da planilha (sem lista fixa de códigos) e separa as diferenças
por causa, em vez de jogar tudo em "divergiu":

| Causa | Significa |
|---|---|
| `FORMULA` | mesmos insumos, resultado diferente — **bug**, e o único caso que reprova |
| `INSUMO` | a conta está certa dos dois lados; LOADTIME/manutenção diferem entre extrações |
| `RELATORIO` | LOADTIME oficial = período cheio (seção acima) |
| `NOMES_AGRUPADOS` | dois códigos oficiais com o mesmo nome de recurso viram uma linha no portal |

O script também confere que `calculateMachineG0134Availability()` reproduz a coluna
`Disponibilidade` da planilha linha a linha, que tabela e painel de detalhe mostram os
mesmos números no mesmo filtro, e que o agregado é ponderado pela carga.

Resultado em agosto/2026: 26/26 linhas reproduzidas pela fórmula, 25 máquinas comparadas,
**0 divergências de cálculo**.

## Base de tempo

`durationHours` (Tempo Decorrido) é a base oficial, alinhada à Management View.
`realDurationHours` fica **apenas como auditoria** e nunca substitui `durationHours` —
não existe fallback `realDurationHours ?? durationHours` no cálculo.
