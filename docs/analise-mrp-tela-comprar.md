# Análise MRP — tela Comprar (FASE E)

A rota definitiva é **`/dashboard/analise-mrp`**. A antiga `/dashboard/lubrificantes` responde com **307** para ela, configurado em `next.config.mjs`; o `page.tsx` legado também redireciona, como reserva. No menu, o item "Análise MRP" (ícone `PackageSearch`) aponta para a rota nova, e os dados de lubrificação continuam no banco.

## Arquitetura (nenhuma regra MRP no React)

| Camada | Arquivo | O que faz |
|---|---|---|
| Lista pura | `src/lib/mrp/buy-list.ts` | `filtrarCompra()` (filtros e as 5 ordenações, sort estável) e `bgStatus()` (`mrpSituation`) |
| Trava pura | `src/lib/mrp/lock.ts` | trava do "Atualizar tudo", sem SheetJS (usável no navegador) |
| Leitura | `src/services/mrp-listing.service.ts` | lê os `MrpAnalysisItem` do run vigente por `position`, monta situação e observação (`obsDe`) e aplica o filtro. Os itens ficam em cache **por runId**: o run é imutável |
| Atualizar tudo | `src/services/mrp-update.service.ts` | `confirmMrpImport` (FASE C, base nova inativa) → `runMrpAnalysis` (FASE D), ativando a base nova **na mesma transação** em que o run vira vigente |
| Página | `src/app/dashboard/analise-mrp/page.tsx` | só **consulta** a análise vigente; nunca roda o motor ao abrir |
| UI | `src/components/mrp/MrpAnalysisView.tsx`, `MrpBuyTab.tsx`, `MrpImportModal.tsx` | cabeçalho, metadados, abas, KPIs, filtros, tabela e modal "Atualizar planilhas" |

| API | Acesso | Função |
|---|---|---|
| `GET /api/mrp/analysis/current/items?q&status&area&family&sort&limit` | qualquer usuário autenticado | `items`, `filteredCount`, `totalCount`, `suggestedFiltered`, `hasMore`, `families` |
| `POST /api/mrp/update-all` | ADMIN e GESTOR | Atualizar tudo |
| `POST /api/mrp/import/cancel` | ADMIN e GESTOR | Limpar anexos |

O `inspect` aceita `currentSlots`, para reproduzir o `receberArquivos()` quando há um segundo envio.

## Comportamento (igual ao HTML)

- **KPIs** (vindos de `MrpAnalysisRun.kpis`, sem recálculo):

  | Card | Valor | Descrição |
  |---|---|---|
  | Comprar | status Comprar | materiais zerados |
  | Verificar | status Verificar | abaixo do mínimo |
  | Em trânsito | status Comprado | já comprados |
  | Qtd. sugerida | `qtd` (inclui materiais OK com sugerida > 0) | soma da reposição |
  | Sem necessidade | status OK (inclui sem MRP) | estoque dentro do mínimo |
  | Analisados | `total` | Mecânica + Elétrica |

  Clicar em Comprar, Verificar, Em trânsito ou Sem necessidade aplica o filtro de status.
- **Filtros:**
  - **Busca:** `norm(código)` ou `norm(descrição)`, com debounce de 300 ms. "1885-0125" encontra "18850125".
  - **Status:** Precisa comprar (padrão, só Comprar + Verificar), Só Comprar, Só Verificar, Em trânsito, Sem necessidade, Todos.
  - **Área.**
  - **Conjunto:** só os presentes no run, na ordem de `FAMS`.
  - Os filtros ficam na URL, via `history.replaceState`, sem recarregar a página.
- **Ordenações:**

  | Ordenação | Critério |
  |---|---|
  | Prioridade | Comprar → Verificar → Comprado → OK, depois maior sugerida, depois menor saldo |
  | Maior quantidade | sugerida, decrescente |
  | Menor saldo | saldo, crescente |
  | Código | `localeCompare("pt-BR", { numeric: true })` |
  | Descrição | `localeCompare("pt-BR")` |

  Empates completos seguem `position`, a ordem do `materiais()`, pelo sort estável.
- **Paginação:** 200 linhas, e "mostrar mais" soma 400 (600, 1.000…).
- **Tabela:** Código · Material (com selos de área, conjunto e grupo) · Saldo · Mín · Máx · Comprar · Situação.
  - **Comprar:** sugerida + UM, ou "—" quando a sugerida é ≤ 0.
  - **Situação:** Comprar / Verificar / Em trânsito / Sem MRP / OK, com a observação do `obsDe()` abaixo.
  - **Números:** formatados como o `fmt()` do HTML (`22270.499999999985` aparece como "22.270,5"). Só apresentação.
- **Exportação:** os botões "Excel da lista" e "Por área" aparecem desabilitados ("em breve"); a exportação entra na FASE J.

## Atualizar tudo

O fluxo vai de upload assinado → inspect (slots, tipo e aba) → preview (corrigir tipo, aba, depósito ou área sem reenviar) → `update-all`.

- **Base:** sem planilha do MRP, usa a Base MRP ativa. Com planilha do MRP, a base nova é validada, gravada inativa e ativada junto com o run.
- **Falha:** se a importação ou a análise falhar, a base e a análise vigentes não mudam, e a tela continua mostrando a anterior com a mensagem de erro.
- **Sucesso:** toast "Análise MRP atualizada com sucesso.", o modal fecha e a tela se atualiza com `router.refresh()`. Os componentes são remontados pelo `runId`.

## Consultas (medidas)

| Ação | Consultas |
|---|---|
| Abrir a página (dados do módulo) | 9 (resumo + itens + base ativa + depósito) |
| Aplicar um filtro | 1 (run vigente; itens em cache) |

## Testes

| Comando | Cobertura | Resultado |
|---|---|---|
| `npm run test:mrp-buy-list` | `filtrarCompra()` do HTML: ordem e soma do filtro em 6 status × 5 ordenações × 15 variantes | 450 combinações, 0 divergências |
| `npm run test:mrp-screen-db -- --direct` | serviço com banco (ver abaixo) | aprovado |
| `npm run build && npm run test:mrp-e2e -- --direct` | Playwright em `next start` (ver abaixo) | aprovado |

O `test:mrp-screen-db` cobre:
- estado vazio;
- Atualizar tudo;
- KPIs iguais a `run.kpis` e ao `contar()` do HTML;
- 150 combinações de ordem iguais ao HTML;
- `bgStatus()` e `obsDe()`;
- paginação;
- consultas;
- base nova ativada junto com o run;
- falha que preserva a base e a análise anteriores.

O `test:mrp-e2e` cobre:
- o 307;
- o menu;
- o estado vazio;
- o modal;
- os 6 KPIs iguais ao banco;
- a tabela igual à API;
- as 7 colunas;
- o clique no KPI;
- "mostrar mais" de 200 a 1.000;
- a busca `norm`;
- área e conjunto;
- "Sem MRP";
- a ausência de rolagem horizontal no celular.

**Upload real pela tela:** a máquina local não tem a `SUPABASE_SERVICE_ROLE_KEY`, que só existe na Vercel. Nesse caso o e2e valida o **erro claro** no modal e gera a análise pelo mesmo service do botão. O upload real deve ser conferido no Preview.

## Pendente

- **PARIDADE MB52 REAL: PENDENTE.**
- **PARIDADE COMPRAS REAL: PENDENTE.**
- Não está pronto para produção.
