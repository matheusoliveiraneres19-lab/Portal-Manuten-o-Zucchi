# Análise MRP — Validação final 1:1 com dados reais (FASE K)

## Arquivos e depósito

Os arquivos são os originais. Foram só lidos: não houve edição nem regravação.

| Arquivo | Origem | sha256 (16) |
|---|---|---|
| Controle_MRP_SAP_novo_analisado.xlsx | OneDrive · MRP Sap novo | 49011cd819d72d9c |
| estoque 0810.xlsx | Downloads | e3f2f01b29414d72 |
| compras 0810.xlsx | Downloads | 13a7b0620a5bb8c7 |

O depósito oficial é **1000**, lido da coluna **Depósito**. O 1400 é o **Centro**. "Todos os depósitos" rodou só como diagnóstico e deu o mesmo resultado, porque as 38 linhas são do depósito 1000.

## Como reproduzir

```
npm run validate:mrp-parity                                   # HTML x Portal, UTC + America/Sao_Paulo (sem banco)
npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --setup  # run real no banco, tempos, rollback, locks
npm run build && npx tsx scripts/mrp/e2e-mrp-real.ts --direct # telas com o run real (next start local)
npx tsx scripts/mrp/validate-mrp-real-db.ts --direct --cleanup
```

- **`validate:mrp-parity`** roda duas implementações independentes sobre os mesmos três arquivos:
  - o **HTML original**, na sandbox, com a SheetJS 0.18.5 embutida nele;
  - o **Portal**, com a SheetJS 0.20.3.
- **Referência:** a execução do HTML. Nenhum valor esperado foi escrito à mão.
- **Classificação das diferenças:** qualquer diferença conta como `BUG_PORTAL`. A exceção é `KNOWN_LEGACY_DATE_BUG`, aplicável só a datas, fora de UTC e com o Portal determinístico.

## Auditoria dos arquivos

### Base

| Aba | Linhas físicas | Resultado |
|---|---|---|
| MRP Analise manutenção | 3.466 | 3.465 materiais, Mecânica |
| MRP Analise Eletrica | 795 | 794 materiais, Elétrica |
| MRP Automatico Gyan | 40 | ignorada |

- **Materiais:** 4.259 no total (Mecânica 3.465, Elétrica 794).
- **Qualidade:** 0 duplicados, 0 sem código.
- **Parâmetros:** 3.333 sem mín/máx.
- **Conjuntos:** 146 materiais.

  | Conjunto | Materiais |
  |---|---|
  | Satélite Simec 6 | 42 |
  | Satélite Breton 8 | 39 |
  | Satélite Breton 6 | 40 |
  | Satélites Breton | 10 |
  | Coroa Cemar | 15 |

### Estoque

- **Estrutura:**
  - aba `Data`, intervalo A1:P42, com 42 linhas físicas;
  - cabeçalho na linha 1, seguido de 41 linhas de dados;
  - 38 linhas têm Material; 3 não têm.
- **Depósito e Centro:** Depósito `1000` × 38; Centro `1400` × 38.
- **Filtro do depósito 1000:**
  - 38 linhas no depósito e 0 fora;
  - 38 códigos únicos, sem duplicados.
- **Utilização livre:** a soma é **0**, com menor 0 e maior 0. **Nenhum código tem saldo positivo.** O valor zero foi mantido, sem correção.
- **Base MRP:** só **3** códigos pertencem à Base; **35** estão fora dela.
- **Linhas anômalas 40–42:** têm só a UM (PEC/UN/UND) e Utilização livre 0, sem Material.
  - Portal: `IGNORED (SEM_CODIGO)`. HTML: não entram em `estoque`. Os dois decidem igual.
  - Elas caem por **falta de código**, não pelo filtro de depósito.
  - O valor 22 não aparece em nenhuma célula do arquivo.

### Compras

- **Estrutura:** aba `Data`, A1:J1527, com 1.527 linhas físicas; 1.526 linhas lidas e 1.526 aceitas, nenhuma sem Material.
- **Colunas reconhecidas:**

  | Campo | Coluna |
  |---|---|
  | desc | Texto Breve do Pedido |
  | qtd | Quantid |
  | data | Data da Requisição |
  | req | Requisição |
  | ped | Pedido de Compra |
  | rec | Data Recebimento |
  | prev | Previsão de entrega |
  | forn | Descrição Fornecedor |

- **Códigos:** 972 distintos, dos quais 196 têm mais de uma compra. O código com mais compras é o 39675, com 129.
- **comprasIndex():**
  - pend 191 · rec 781 · sem 0;
  - Σ da última compra dos pendentes: 2.496,97.
- **Base MRP:**
  - na Base: 462 códigos / 602 linhas;
  - fora da Base: 510 códigos / 924 linhas.

## KPIs reais (depósito 1000)

| KPI | Valor |
|---|---|
| Analisados | 4.259 |
| Comprar | 880 |
| Verificar | 0 |
| Em trânsito MRP (Comprado) | 46 |
| Sem necessidade (OK) | 3.333 |
| Qtd. sugerida | 25.064 |
| Sem movimentação | 3.333 (78,3% da base) |
| Capital parado | 0 |
| Qtd. parada | 0 |
| Zerados | 3.333 |
| Linhas de compra | 1.526 |
| Códigos de compra | 972 |
| Compras pendentes | 191 |
| Qtd. em trânsito | 2.496,97 |
| Recebidos | 781 |
| Sem pedido/requisição | 0 |
| Saíram do MRP | 46 |
| Qtd. evitada | 1.264 |

**Por área:**

| Área | Total | Comprar | Verificar | Comprado | OK | Qtd. sugerida |
|---|---|---|---|---|---|---|
| Mecânica | 3.465 | 720 | 0 | 36 | 2.709 | 20.921 |
| Elétrica | 794 | 160 | 0 | 10 | 624 | 4.143 |
| Total | 4.259 | 880 | 0 | 46 | 3.333 | 25.064 |

**Por conjunto:**

| Conjunto | Total | Comprar | Verificar | Comprado | OK | Qtd. sugerida | Sem mín/máx |
|---|---|---|---|---|---|---|---|
| Satélite Simec 6 | 42 | 29 | 0 | 1 | 12 | 425 | 12 |
| Satélite Breton 8 | 39 | 10 | 0 | 3 | 26 | 143 | 26 |
| Satélite Breton 6 | 40 | 19 | 0 | 1 | 20 | 223 | 20 |
| Satélites Breton | 10 | 7 | 0 | 1 | 2 | 115 | 2 |
| Coroa Cemar | 15 | 7 | 0 | 0 | 8 | 43 | 8 |
| Todos os conjuntos | 146 | 72 | 0 | 6 | 68 | 949 | 68 |

## Paridade HTML x Portal

| Categoria | Itens comparados | Divergências Portal | Legacy known bugs |
|---|---|---|---|
| Detecção (slots/abas/cabeçalhos) | 3 | 0 | 0 |
| Base (10 campos + ordem) | 4.259 | 0 | 0 |
| Estoque (código + saldo, contagens) | 39 | 0 | 0 |
| Compras (10 campos por linha) | 1.526 | 0 | 0 |
| Última compra (cmpOrdem de cada linha + grupo: última, n, status) | 2.498 | 0 | 0 |
| Motor (17 campos + compra + observação) | 4.259 | 0 | 0 |
| KPIs (contar, Saíram do MRP, parado, compras) | 4 blocos | 0 | 0 |
| Comprar (filtrarCompra: count, ordem, sugerida, 1ªs/últimas) | 223 combinações | 0 | 0 |
| Áreas | 3 | 0 | 0 |
| Conjuntos | 6 | 0 | 0 |
| Áreas/Conjuntos (cartões renderAreas) | 17 checagens | 0 | 0 |
| Em trânsito (KPIs + 48 combinações renderTransito) | 4 checagens | 0 | 0 |
| Estoque parado (KPIs + 45 combinações renderParado) | 4 checagens | 0 | 0 |
| Base MRP UI (36 combinações renderBase + ordem) | 4 checagens | 0 | 0 |
| Exportações (6 tipos: 420 lista/por área + 36 parado + 36 base + conjuntos + compras; .xlsx relido) | 21 checagens | 0 | 0 |

- **UTC:** BUG_PORTAL = 0, KNOWN_LEGACY_DATE_BUG = 0.
- **America/Sao_Paulo:** BUG_PORTAL = 0, KNOWN_LEGACY_DATE_BUG = 0.
- **Fuso:** as saídas do Portal são idênticas nos dois fusos.
- **Recortes vazios:** nas exportações, 300 recortes vazios mostram "Nada para exportar." em vez de um .xlsx só com cabeçalho. É a diferença autorizada nº 3.

## Banco (serviços, run real)

- **Atualizar tudo** com os três arquivos reais e o depósito 1000, executado pelos serviços. O Storage foi substituído por `download` do disco.
  - Fontes gravadas: base 4.259, estoque 38 e compras 1.526.
  - Os 4.259 itens gravados (Decimal), relidos, são iguais ao `analysis` do HTML campo a campo.
  - Os KPIs gravados são iguais ao `contar()`.
- **Rollback com os arquivos reais:** depois de uma falha forçada na análise, a análise e a base anteriores continuam vigentes.
  - As fontes novas ficam completas, mas não são usadas.
  - A base nova fica inativa.
- **Tempos medidos daqui (Brasil → Supabase us-west-2, conexão direta):**

  | Etapa | Tempo |
  |---|---|
  | inspect base / estoque / compras | 0,9 / 0,4 / 0,5 s |
  | preview base / estoque / compras | 1,0 / 0,4 / 0,5 s |
  | Atualizar tudo (total) | 41 s |
  | Análise dentro do Atualizar tudo | 11,7 s |
  | Motor | 14 ms |

  A análise de 11,7 s se divide em carga 3,3 s e gravação 8,4 s, com 23 consultas.

## Locks

Antes, depois do setup e depois da limpeza:
- 0 transações *idle in transaction*;
- 0 locks em tabelas MRP;
- 0 importações MRP presas;
- 0 runs incompletos.
