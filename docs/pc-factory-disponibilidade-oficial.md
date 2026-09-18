# Disponibilidade oficial do PC-Factory

> ### ⚠ MUDANÇA DE REGRA — 2026-09
>
> A **Disponibilidade Física** passou a ser a fórmula oficial do portal, por decisão
> da manutenção após conferência manual com os dados físicos:
>
> ```
> Disponibilidade Física (%) =
>   (Tempo Total do Período − Horas de Parada) ÷ Tempo Total do Período × 100
> ```
>
> Conferência que motivou a troca (agosto/2026, uma máquina):
> `744 h − 128 h = 616 h` → `616 / 744 × 100 ≈ 82,8 %`.
>
> O **denominador deixou de ser o `G0134.LOADTIME`** e passou a ser o
> **tempo-calendário** do recorte (dias × 24 h). Tudo o que este documento descreve
> abaixo sobre LOADTIME, Tempo Operacional, Carga, Setup e Fora de Turno continua
> valendo **apenas para a auditoria histórica G0134**, que foi preservada lado a lado
> e não alimenta mais nenhuma tela gerencial.
>
> - Fórmula nova: `src/utils/pc-factory-physical-availability.ts`
> - Fórmula antiga: `calculateMachineG0134Availability()` em `pc-factory-normalizer.ts`
> - Comparação entre as duas: `npm run compare:pc-factory-availability`
> - Testes da fórmula nova: `npm run test:availability`
>
> Ver a seção **[Disponibilidade Física](#disponibilidade-física-regra-oficial-desde-2026-09)**
> no fim deste documento.

## A fórmula G0134 (histórica — auditoria)

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
| `Disponibilidade` | `g0134Availability(agg)` | `metrics.g0134AvailabilityPercent` |

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

**Fonte única da fórmula G0134:** `calculateMachineG0134Availability()` em
`src/utils/pc-factory-normalizer.ts`. Desde 2026-09 ela alimenta **apenas a auditoria**
(painel de qualidade, gaveta da máquina recolhida, `validate:pc-factory`). O indicador
das telas é a Disponibilidade Física — ver a seção final. **Não criar regra paralela**
para nenhuma das duas.

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

Em código isso continua automático, nas DUAS fórmulas: `g0134Availability(agg)` recebe o
agregado já somado, e a Disponibilidade Física usa `calculateFleetPhysicalAvailability()`
(horas do período × máquinas válidas). Nenhuma das duas faz média de percentuais.

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

---

## Disponibilidade Física (regra oficial desde 2026-09)

### A fórmula

```
Disponibilidade Física (%) =
  (Tempo Total do Período − Horas de Parada) ÷ Tempo Total do Período × 100
```

Depende de **dois números e só deles**. Não usa — e não pode passar a usar —
`G0134.LOADTIME`, Tempo Operacional, Fora de Turno, Recurso Não Programado, Setup,
MTBF, MTTR, MTTA, quantidade de quebras/eventos, nem média de disponibilidades.

### Tempo Total do Período

Tempo-**calendário** do recorte selecionado, via `calculatePeriodHours(de, até)`.
Nenhum mês está fixo em código:

| Filtro | Conta | Tempo Total |
|---|---|---|
| 01/08/2026 → 31/08/2026 | 31 dias × 24 | **744 h** |
| 01/04/2026 → 30/04/2026 | 30 dias × 24 | 720 h |
| 01/02/2026 → 28/02/2026 | 28 dias × 24 | 672 h |
| 01/08/2026 → 10/08/2026 | 10 dias × 24 | **240 h** |

Datas sem hora contam **dias civis inclusivos**; com timestamps reais, a diferença é
exata. Sem filtro de período, a janela é a extensão da base (`resolvePeriodWindow`).

### Horas de Parada

Soma direta de `durationHours` dos **seis** tipos de manutenção:

```
downtimeHours = Mecânica + Elétrica + Automação + Planejada + Terceiros + Aguardando
```

É exatamente a coluna **Paradas** da tabela Confiabilidade por Máquina
(`totalMaintenanceForAvailability`). O número da tela e o número da fórmula são o
mesmo — a conferência manual depende disso. Nunca reconstruído a partir de MTTR/MTTA.

Esta tarefa **não mudou a classificação dos eventos**: mudou o denominador e a fórmula.

### Agregados: ponderados, nunca média simples

Para um grupo de área (Indústria de Granito/Mármore/Dolomítico, Serraria), linha de
produção ou a frota inteira:

```
Tempo Total do grupo = horas do período × nº de máquinas válidas
Disponibilidade      = (Tempo Total do grupo − Σ paradas) ÷ Tempo Total do grupo × 100
```

Exemplo: agosto, 10 máquinas → `744 × 10 = 7.440 h`. Com 1.100 h de parada,
`(7.440 − 1.100) / 7.440 = 85,2 %`. Média simples dos percentuais individuais daria
outro número e faria uma máquina de baixíssimo volume pesar igual à linha principal.

### Evolução mensal

Cada mês tem o **seu** total-calendário (jan 744 h, fev 672 h, abr 720 h). O total de
um mês nunca é aplicado a outro. Nas pontas do recorte o mês entra só com a fatia
dentro da janela (`calculateMonthHoursWithinWindow`): um filtro de 10/08 a 20/09 dá
22 dias de agosto e 20 de setembro.

### Vigência das máquinas

A base do PC-Factory **não tem** cadastro de entrada em operação, desativação ou
vigência do recurso — `PcFactoryRecord` é um histórico de status, e não existe tabela
de máquinas. Portanto vale a regra gerencial documentada:

> Cada máquina válida conta como disponível **24 h/dia durante todo o período
> selecionado**.

"Máquina válida" = recurso distinto presente no recorte. A data de entrada **não** é
inferida do primeiro registro do PC-Factory — seria inferência insegura.

### Paradas maiores que o período

`downtimeHours > totalPeriodHours` é fisicamente impossível e indica sobreposição ou
duplicidade de registros. O portal **não mascara**: o percentual fica em 0 %, mas o
dataset carrega `downtimeExceedsPeriod` e a tela emite

> Horas de parada superiores às horas-calendário do período. Verifique sobreposição ou
> duplicidade dos registros.

### Onde está o código

| Papel | Arquivo |
|---|---|
| Fórmula (pura, sem banco) | `src/utils/pc-factory-physical-availability.ts` |
| Janela do período | `resolvePeriodWindow()` em `pc-factory.service.ts` |
| Uma máquina | `buildMachineAvailabilityMetrics(records, periodHours)` |
| Conjunto de máquinas | `calculateFleetPhysicalAvailability()` |
| Teste da fórmula | `npm run test:availability` |
| Comparação Física × G0134 | `npm run compare:pc-factory-availability` |

### Invariantes garantidas

```
Horas Disponíveis = Tempo Total − Paradas
Disponibilidade   = Horas Disponíveis / Tempo Total × 100

Paradas = 0            → 100 %
Paradas = Tempo Total  → 0 %
Tempo Total ≤ 0        → null   (a UI mostra "—", nunca 0 %)
```

Nunca NaN, nunca Infinity, nunca acima de 100 % nem abaixo de 0 %.

### Impacto medido na troca (agosto/2026, 40 máquinas)

| | G0134 | Física |
|---|---|---|
| Frota (ponderada) | 90,13 % | **96,76 %** |
| Média entre máquinas | 91,56 % | 96,76 % |
| Abaixo de 85 % | 5 de 32 com valor | 2 de 40 |
| Faixas verde / âmbar / vermelho | 26 / 3 / 3 | 38 / 1 / 1 |

A Física é sistematicamente maior porque o denominador é o calendário cheio (744 h),
enquanto o LOADTIME já descontava Fora de Turno, Recurso Não Programado e Setup —
em agosto o LOADTIME da frota era 9.779 h contra 29.760 h de calendário.

**Os limites (meta de 85 %, faixas de cor 90/70) não foram alterados nesta tarefa** —
mudar meta exige autorização do negócio. O impacto acima existe para essa decisão.

### MTBF, MTTR e MTTA continuam separados

Não entram na fórmula e não são recalculados a partir dela. Seguem com as definições
e denominadores de sempre, ao lado da Disponibilidade na tabela — mexer em qualquer um
deles não pode mover a Disponibilidade em nenhum ponto do módulo.
