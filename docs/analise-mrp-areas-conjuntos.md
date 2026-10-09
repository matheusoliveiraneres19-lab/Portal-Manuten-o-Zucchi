# Análise MRP — Áreas & Conjuntos (FASE F)

Reproduz a aba "Áreas & Conjuntos" do `Analise_MRP_Compacto (1).html` (`renderAreas()`, `cardHTML()` e `filtrarPor()`) sobre a análise vigente **já gravada**. O motor não roda de novo e nenhuma fórmula fica no React.

## Onde está

| Camada | Arquivo | Papel |
|---|---|---|
| Regra pura | `src/lib/mrp/areas.ts` | `summarizeMrpSubset` (o `contar()` = `countMrp` da FASE D sobre um recorte, mais "sem mín/máx" e a barra) e `buildMrpAreasSummary` (cartões e destinos de clique) |
| Leitura | `src/services/mrp-listing.service.ts` → `getMrpAreasSummary(runId)` | usa o **mesmo cache por runId** da lista Comprar |
| UI | `src/components/mrp/MrpAreasTab.tsx` | cartões são `<button>` (Enter e Espaço nativos) |
| Navegação | `src/components/mrp/MrpAnalysisView.tsx` | `?tab=buy|areas`, `pushState` e voltar/avançar |

## Regras (iguais ao HTML)

- **Mecânica × Elétrica:** três cartões, Mecânica (`area = "Mecânica"`), Elétrica (`area = "Elétrica"`) e Total (todos os itens).
- **Conteúdo de cada cartão:** total de materiais, Comprar, Verificar, Em trânsito (status Comprado) e Qtd. sugerida (soma de `suggested` de **todos** os itens do recorte, inclusive OK).
- **Barra:** Comprar / Verificar / Em trânsito / OK, cada um sobre `max(1, total)`.
- **Satélites & Coroas:**
  - só os conjuntos presentes no run, na ordem de `FAMS`;
  - "X sem mín/máx" aparece quando há materiais sem parâmetros;
  - sem nenhum conjunto, a aba mostra "Nenhum conjunto identificado na Base MRP atual." e mantém o cartão "Todos os conjuntos", que o HTML também desenha.
- **Clique** (`filtrarPor(área, conjunto)`): abre Comprar com status `need` e a área e/ou conjunto do cartão.
  - Clicar num conjunto **limpa a área**.
  - A busca e a ordenação atuais são mantidas, como no HTML.
  - Na URL, `status=need` fica implícito por ser o padrão. `?tab=buy&status=need&area=…` também funciona.
- **"Todos os conjuntos" — legacy parity behavior:** os números consideram só os itens **com** conjunto, mas o clique abre a lista **geral** (`filtrarPor('', '')`). Mantido de propósito até a paridade final (FASE K).

## Consultas

| Situação | Consultas |
|---|---|
| Abrir a aba (com a lista no cache) | 0 extras |
| Cache frio | 1 consulta, a dos itens do run |

Um novo run, depois do "Atualizar tudo", gera outra chave de cache, então os dados da análise anterior nunca são reutilizados.

## Testes

| Comando | Cobertura | Resultado |
|---|---|---|
| `npm run test:mrp-areas` | números de cada cartão, larguras da barra, "sem mín/máx" e destinos de clique lidos do markup gerado pelo `renderAreas()` original, mais valores crus iguais ao `contar()` do HTML | 81 checagens, 0 divergências em 5 cenários |
| `npm run test:mrp-screen-db -- --direct` | cartões do run gravado iguais ao HTML; cada clique abre lista com Comprar + Verificar do cartão; consultas; novo run sem cache antigo | aprovado |
| `npm run test:mrp-e2e -- --direct` | ver abaixo | aprovado |

Os 5 cenários do `test:mrp-areas` são: base embutida com 3 sementes, base fixture e base sem conjuntos.

O `test:mrp-e2e` cobre:
- `?tab=areas` abre direto e se mantém no refresh;
- cartões iguais ao serviço;
- cliques com mouse, Enter e Espaço;
- conjunto que limpa a área;
- "Todos os conjuntos" abrindo a lista geral;
- voltar e avançar;
- só a aba ativa destacada;
- celular sem rolagem horizontal.

## Pendente

- **PARIDADE MB52 REAL: PENDENTE.**
- **PARIDADE COMPRAS REAL: PENDENTE.**
- Não está pronto para produção.
