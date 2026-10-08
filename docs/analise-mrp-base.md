# Análise MRP — Base MRP (FASE I)

Reproduz a aba "Base MRP" do `Analise_MRP_Compacto (1).html` (`renderBase()`, `baseFiltrada()`, `importarBase()` e "Voltar à base embutida") em `/dashboard/analise-mrp?tab=base`.

## Qual base é exibida

- **Com análise vigente:** a base **usada pela análise** (`MrpAnalysisRun.baseVersionId`). Assim todas as abas mostram o mesmo snapshot.
- **Sem análise vigente:** a Base MRP ativa.
- **Base ativa diferente da base do run** (por exemplo, ativada por outro caminho): a aba continua mostrando a base do run e exibe o aviso "Existe uma Base MRP ativa diferente da utilizada pela análise atual." Nada é recalculado.
- **Sem nenhuma base:** "Nenhuma Base MRP cadastrada."

| Camada | Arquivo |
|---|---|
| Regra pura | `src/lib/mrp/base-view.ts` (`filterMrpBase` = `baseFiltrada()`, `summarizeMrpBase`, `mrpBaseHasNoParams`) |
| Leitura | `src/services/mrp-base-view.service.ts` (`getMrpBaseView`, `getCurrentMrpBaseListing`) |
| Troca/restauração | `src/services/mrp-base-admin.service.ts` (`replaceMrpBaseFromImport`, `restoreMrpSeedBase`) |
| API | `GET /api/mrp/base/current`, `GET /api/mrp/base/current/items?baseQ&baseArea&baseFilter&limit`, `POST /api/mrp/base/replace`, `POST /api/mrp/base/restore` |
| UI | `src/components/mrp/MrpBaseTab.tsx` |

## Resumo

- **Origem:** "Base inicial do sistema" (`SEED_HTML`) ou "Planilha enviada: <arquivo>".
- **Metadados:** versão, data de gravação, usuário, e se é a base da análise atual ou a ativa.
- **Total, Mecânica, Elétrica:**
  - contados pela área do material;
  - o HTML fazia Elétrica = total − Mecânica, o que dá o mesmo resultado enquanto só existem as duas áreas.
- **Sem mín/máx:** `min <= 0 && max <= 0`, lido da **base** e não da análise.
- **Em satélites/coroas:** conjunto preenchido.

| Base | Total | Mecânica | Elétrica | Sem mín/máx | Satélites/coroas |
|---|---|---|---|---|---|
| Inicial (SEED_HTML) | 4.280 | 3.485 | 795 | 3.323 | 144 |
| Real `Controle_MRP_SAP_novo_analisado.xlsx` (Gyan ignorada) | 4.259 | 3.465 | 794 | 3.333 | 146 |

## Tabela "Materiais cadastrados"

- **Filtros:**
  - busca `norm()` no código e na descrição, com debounce de 300 ms;
  - área;
  - Todos os materiais / Sem mín/máx definido / Só satélites e coroas.
  - Os filtros ficam na URL como `baseQ`, `baseArea` e `baseFilter`.
- **Ordem:** a de `materiais()`, sem reordenar.
- **Colunas:**
  - Código;
  - Material (descrição, selos de área e conjunto, "sem mín/máx");
  - Mín;
  - Máx;
  - Grupo ("—" quando vazio);
  - Status MRP ("—" quando vazio).
- **Paginação:** 200 linhas, e "mostrar mais" soma 400.
- **Estados vazios:** "Nenhum material neste filtro".
- **Excel da base:** desabilitado, "em breve".

### Ordem sem coluna `position`

`MrpBaseMaterial` não ganhou `position`. A ordem de `materiais()` é reconstruída por `orderMrpBaseMaterials`, usando:

1. a ordem da aba em `MrpBaseVersion.sheets` (só as abas que trouxeram material, na ordem do arquivo);
2. `sourceRow`, a linha da primeira ocorrência.

`test:mrp-base-view` **embaralha** os registros e confere a ordem reconstruída contra `materiais()` do HTML:

- seed: 4.280 materiais;
- base real: 4.259 materiais;
- fixture: 2 áreas padrão.

Resultado: 0 divergências, inclusive nos cortes de 200, 600 e 1.000 linhas.

## Enviar nova base / restaurar base inicial

Só ADMIN e GESTOR podem enviar ou restaurar. Os outros perfis veem a aba, mas sem os controles, e as rotas POST respondem 403.

### Enviar a planilha do MRP

O envio reaproveita o fluxo da FASE C:

1. `upload-url`;
2. `inspect`;
3. `preview` com `kind: "base"`, com a área padrão escolhida na tela;
4. confirmação.

**O que acontece em cada situação:**

- **Com análise vigente:**
  1. A versão nova é gravada **inativa**.
  2. `runMrpAnalysis` roda com a base nova e o **mesmo** estoque e as **mesmas** compras do run atual, com `trigger = BASE_REIMPORT` e `activateBaseVersion`.
  3. A base e o run novos passam a valer na **mesma transação**.
- **Sem análise vigente:** a versão é gravada e ativada. Não há o que recalcular.
- **Se a análise falhar:**
  - a base e a análise anteriores continuam vigentes;
  - a versão nova fica no histórico, inativa.

### Restaurar base inicial

Equivale ao "Voltar à base embutida" do HTML. Reaproveita a versão `SEED_HTML` já gravada e **não duplica** os 4.280 materiais.

- **Com análise vigente:** novo run `BASE_RESTORE` com o mesmo estoque e as mesmas compras, de forma atômica.
- **Sem análise vigente:** só ativa a seed.
- **Base inicial já em uso:** nada muda, e o botão fica desabilitado.
- **Auditoria:** `AuditLog` com a ação `restaurar_base_mrp`. O envio usa o `auditImport`.

Antes de enviar ou restaurar com análise vigente, a tela pede confirmação: "A alteração da Base MRP recalculará a análise atual usando o mesmo estoque e as mesmas compras. Deseja continuar?"

## Consultas

| Situação | Consultas |
|---|---|
| Aba com cache frio (resumo + tabela) | 6 (run vigente + base ativa, 2×; versão + materiais) |
| Com cache por versão (resumo + filtro) | 4 (só resolve run vigente/base ativa) |

As versões são imutáveis, então o cache é por `versionId`.

## Testes

| Script | Cobertura |
|---|---|
| `npm run test:mrp-base-view` | paridade pura com `renderBase()`/`baseFiltrada()`: resumo, 36 combinações busca × área × filtro (ordem, 6 colunas, selos), ordem com registros embaralhados, cortes 200/600/1000 |
| `npm run test:mrp-base-db -- --direct` | base exibida, sem análise (enviar/restaurar), snapshot (aviso), `BASE_REIMPORT`, falha atômica, `BASE_RESTORE`, falha na restauração, consultas, limpeza |
| `npm run test:mrp-e2e -- --direct` (seção 9b) | tela: resumo, colunas, filtros, URL, voltar/avançar, envio (caminho de erro sem Storage local), aviso, restaurar pela tela, VISUALIZADOR (403), celular |

PARIDADE MB52 REAL: PENDENTE · PARIDADE COMPRAS REAL: PENDENTE.
