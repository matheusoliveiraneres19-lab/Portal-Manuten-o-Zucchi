# PC-Factory — Disponibilidade (regra oficial)

> Implementado em 2026-08-04. Corrige a "Disponibilidade Estimada" do módulo
> `/dashboard/pc-factory` para seguir a MESMA regra usada pelo PC-Factory (Management
> View / relatório "Indicadores OEE" / Mapa-Andon), em vez da regra anterior (que só
> descontava Manutenção + uma perda genérica, e ignorava Setup, Refeição, Limpeza etc.
> por completo).

## 1. O que estava errado

A "Disponibilidade Estimada" antiga era:

```
(Tempo Planejado − Horas Paradas) / Tempo Planejado
```

com `Horas Paradas = Manutenção (6 status) + Parada/Perda (Falta de Material, Parada não
Identificada, Falta de Utilidades) + Setup`. Todo o resto — Refeição, Limpeza de Setor de
Trabalho, Aguardando Carro Transportador, Ausência/Deslocamento de Operador,
Confraternizações, Revezamento, Medição de Abrasivos, Quebra de Chapa/Ferramenta,
Resina Mole, Parada não Identificada (nome real da coluna), Inspeção de Qualidade — ficava
de fora do cálculo por completo (não classificado em `CATEGORY_BY_KEY`, caía em `OUTROS`/
`OPERACIONAL` e não afetava nem o numerador nem o denominador). No período 02/02–31/07/2026
isso somava mais de 116.000h "esquecidas" — mais de 1/3 do Tempo Planejado.

O PC-Factory, na tela "Indicadores OEE" e no Mapa/Andon, NÃO tem essa terceira categoria
neutra: **todo** status de Recurso é classificado em uma de 4 categorias — Fora de Turno,
Parada Planejada (I ou II), Parada Não Planejada, ou Produzindo — e as 3 últimas afetam o
indicador (ver `docs/` do próprio PC-Factory: "Composição do Tempo - Modelo Tradicional" e
"Relação Status de Recurso e Indicadores de Desempenho").

## 2. Regra nova (idêntica ao PC-Factory)

```
Tempo de Carga      = Tempo Total − Fora de Turno − Recurso Não Programado
Tempo Operacional   = Tempo de Carga − Paradas Planejadas (I e II)
Tempo Trabalhado    = Tempo Operacional − Paradas Não Planejadas
Disponibilidade (%) = Tempo Trabalhado / Tempo Operacional × 100
```

Implementada em `src/utils/pc-factory-normalizer.ts` → `classifyAvailabilityBucket()` +
`AVAILABILITY_BUCKET_BY_CODE` (por código `RCODSTATUS`, mesma fonte confiável já usada em
`classifyManagementGroup`). Consumida em `src/services/pc-factory.service.ts`:

- `aggregateHours()` agora calcula `plannedStopHours` (Paradas Planejadas) e redefine
  `stoppedHours` para ser exatamente as Paradas Não Planejadas (antes era
  manutenção + perdas). `operationalHours` passa a ser o Tempo Operacional oficial
  (antes era um bucket "Refeição + Outros" sem uso na fórmula).
- Todo `availability(agg.plannedHours, agg.stoppedHours)` virou
  `availability(agg.operationalHours, agg.stoppedHours)` — a função em si não mudou,
  só a base (denominador) passou de Tempo de Carga para Tempo Operacional.
- `buildReliabilityByMachine()` (dashboard "Confiabilidade por Máquina") teve seu campo
  `availability` corrigido da mesma forma. MTBF/MTTR/MTTA **não mudaram** — continuam
  escopados só a eventos de manutenção, por decisão de negócio já confirmada anteriormente
  (métrica de confiabilidade, conceitualmente diferente de Disponibilidade/OEE).
- `lossHours`/`setupHours`/`maintenanceHours` continuam existindo com o mesmo significado
  de antes, para os gráficos/legados que não são a Disponibilidade (ex.: composição por
  linha, cards de manutenção por tipo).

## 3. Classificação por status (Planejada × Não Planejada)

Confirmado **ao vivo** no Mapa/Andon do PC-Factory (192.168.0.236:9096) em 2026-08-04:

| Status | RCODSTATUS | Classificação | Fonte |
|---|---|---|---|
| Manutenção Mecânica | 0201 | Não Planejada | Observado ao vivo (ícone vermelho) |
| Ausência de Operador | 0303 | Não Planejada | Observado ao vivo (ícone vermelho) |

Todo o restante foi classificado por analogia à documentação oficial do PC-Factory
("Perdas na Produção" — grupos Operação/Compras/Qualidade/PCP/Movimentação de material/
Manutenção corretiva = Não Planejada; Engenharia industrial/Ambiente-Saúde-Segurança/
Manutenção preventiva/Marketing-Vendas/Educação programada = Planejada). Ver comentários em
`AVAILABILITY_BUCKET_BY_CODE` — itens marcados **"(a confirmar)"** não foram observados ao
vivo nem confirmados no cadastro F0024 (Status de Recurso) / F0029 (Grupo de Status) do
PC-Factory, que não fica acessível pela Management View web (só pelo cliente MES completo):

- `0002` Parada não Identificada
- `0008` Aguardando lançamento
- `0321` Start Check List de Máquina
- `0503` Confraternizações
- `0612` Revezamento
- `0603` Medição de Abrasivos

**Recomendação:** confirmar esses 6 itens com quem administra o PC-Factory (tela F0024/
F0029) e ajustar `AVAILABILITY_BUCKET_BY_CODE` em `src/utils/pc-factory-normalizer.ts` se
necessário — é uma constante, a mudança é local e não exige reimportação de dados (a
classificação é calculada em runtime a partir de `statusCode`/`statusRaw`, já salvos no
banco).

## 4. Impacto esperado

Com o Setup, Refeição, Limpeza, Ausência/Deslocamento de Operador, Quebra de Chapa/
Ferramenta etc. agora entrando corretamente como Paradas Não Planejadas (ou saindo do
Tempo Operacional quando Planejadas), a "Disponibilidade Estimada" deve **cair
substancialmente** em relação ao valor antigo (85,1% no período de teste) — o que é
esperado e correto: o número antigo estava inflado por ignorar categorias inteiras de
parada. O valor novo passa a ser diretamente comparável ao indicador "Disponibilidade"/
"Utilização" mostrado na tela "Indicadores OEE" do PC-Factory para os mesmos filtros.
