# Infraestrutura de importação sobre Supabase Pro

Esta etapa **não alterou nenhuma regra de negócio**. Ela monta a base sobre a
qual os importadores serão migrados um a um — a começar pelo PC-Factory, na
próxima etapa.

---

## 1. Por que isto existe

Os cinco importadores atuais (PC-Factory, Compras, Ordens de Serviço,
Lubrificantes, Locais de Instalação) fazem tudo em um passo só: leem a planilha,
gravam direto na base oficial e registram o histórico no fim. Três consequências:

1. **A base oficial fica exposta.** O PC-Factory roda com `replaceAll: true`:
   apaga a base inteira e recarrega. Se a planilha falhar na metade, o portal
   fica sem dado — e a planilha anterior já não existe mais em lugar nenhum.
2. **Não dá para auditar.** O histórico guarda o *nome* do arquivo. Descobrir de
   qual planilha exatamente saiu um número depende de alguém ter guardado o
   arquivo no computador certo.
3. **Erro vira HTML.** Quando a função serverless estoura tempo ou memória, a
   Vercel devolve uma página de erro e o `res.json()` do front quebra com
   `Unexpected token '<'` — a causa real nunca chega na tela.

---

## 2. Storage — bucket privado das planilhas

**Bucket:** `portal-imports` (privado). Configurável por
`SUPABASE_STORAGE_BUCKET_IMPORTS`.

**Criar uma vez por projeto Supabase:**

```bash
npm run storage:setup-imports
```

O script é idempotente e **falha em voz alta se o bucket estiver público**.

**Estrutura das chaves:**

```
imports/pc-factory/2026/09/20260910T143012Z-apontamentos-agosto.xlsx
imports/compras/2026/09/…
imports/ordens-servico/2026/09/…
imports/lubrificantes/2026/09/…
imports/local-instalacao/2026/09/…
imports/procedimentos/2026/09/…
```

O particionamento por ano/mês não é enfeite: o Storage lista objetos por
prefixo, e uma pasta única com milhares de planilhas fica impraticável de
navegar no painel.

**Acesso:** o arquivo nunca é servido direto. `GET /api/imports/[id]/file`
valida sessão + papel (ADMIN/GESTOR) e devolve uma **URL assinada de 5 minutos**
gerada no servidor.

**Validação:** extensão em `.xlsx/.xls/.csv`, tamanho até 25 MB
(`SUPABASE_IMPORT_MAX_BYTES`). Esse teto é do **objeto no Storage**, não do
corpo da requisição — a Vercel corta o corpo de uma função serverless em
~4,5 MB, e é por isso que existe `createImportUploadUrl()`, que devolve uma URL
assinada para o navegador enviar a planilha **direto ao bucket**, sem passar
pela função. É esse o caminho para as planilhas grandes do PC-Factory.

Arquivos: `src/lib/supabase-server.ts`, `src/services/import-storage.service.ts`.

---

## 3. Histórico — `ImportHistory`

O model **já existia** e continua sendo escrito pelos cinco importadores atuais,
sem alteração. A etapa apenas **adicionou colunas**:

| Coluna | Para quê |
|--------|----------|
| `stage` | ciclo de vida novo (texto) |
| `bucket`, `filePath`, `fileSize`, `mimeType` | rastreio do arquivo no Storage |
| `validRows`, `ignoredRows` | contadores que faltavam |
| `startedAt`, `finishedAt` | duração real da importação |
| `metadata` | contexto livre (layout detectado, período, diagnóstico) |
| `updatedAt` | última alteração do registro |

### Por que `stage` e `status` coexistem

`ImportStatus` (`SUCESSO`/`PARCIAL`/`ERRO`/`EM_PROCESSAMENTO`) é gravado pelos
cinco importadores e lido pela aba Configurações e pelo card de status técnico.
Trocar seus valores pelos da nova especificação quebraria tudo isso de uma vez.

Então `status` fica como está — **o resultado final** — e o ciclo de vida novo
mora em `stage`:

```
UPLOADED → VALIDATING → PROCESSING → COMPLETED
                              ↘ FAILED / CANCELLED
```

O orquestrador espelha um no outro (`STAGE_TO_STATUS` / `resolveLegacyStatus`
em `src/types/imports.ts`), então a tela antiga continua correta sem saber que o
staging existe. Importações anteriores a esta etapa têm `stage = NULL` e a UI as
mostra normalmente.

`stage` é **texto, não enum** — mesma decisão já tomada em `AuditLog.action`:
evita `CREATE TYPE` em migration Supabase e permite estados novos sem migração.

---

## 4. Staging — `ImportStagingRow`

Toda linha da planilha cai aqui **antes** de a base oficial ser tocada:

```
id · importHistoryId (FK, ON DELETE CASCADE) · module · rowNumber
raw (JSONB, linha crua) · normalized (JSONB) · status · errorMessage
```

Status por linha: `PENDING` → `VALID` / `IGNORED` / `INVALID` → `APPLIED`.

### Como isso protege a base oficial

`applyValidatedImport()` recusa **antes de abrir a transação** quando:

- existe linha `INVALID` (salvo `allowPartial: true`);
- **não existe nenhuma linha `VALID`** — recarregar a base a partir de um
  staging vazio é exatamente como se perde tudo.

Passando nessas duas travas, a aplicação roda dentro de **uma transação**, e o
callback `apply` recebe o cliente transacional (`tx`). É isso que substitui o
`replaceAll` destrutivo: o "apagar e recarregar" acontece dentro da mesma
transação, então uma falha na carga desfaz o `DELETE` junto e a base antiga
continua lá.

O staging é lixo de processo, não trilha de auditoria — a trilha é o arquivo no
Storage. `clearStagingRows()` descarta as linhas, e só funciona em estágio
terminal, para nunca puxar o tapete de uma importação em andamento.

---

## 5. Orquestrador

`src/services/import-orchestrator.service.ts`

```ts
const ctx = await startImport({ module: IMPORT_MODULES.PC_FACTORY, fileName, importedBy });

try {
  await registerImportUpload({ ...ctx, module, fileName, body: buffer });  // não bloqueia
  await addStagingRows(ctx.importHistoryId, rows);                          // lotes de 500
  await markImportAsValidating(ctx.importHistoryId, rows.length);

  // …validação específica do módulo, marcando cada linha VALID/IGNORED/INVALID…

  await markImportAsProcessing(ctx.importHistoryId);
  const summary = await applyValidatedImport(ctx.importHistoryId, {
    apply: async (tx, validRows) => {
      // SÓ o cliente transacional `tx`. Usar `prisma` direto aqui escaparia da
      // transação e a metade gravada sobreviveria a um rollback.
    }
  });

  return await markImportAsCompleted(ctx.importHistoryId, summary);
} catch (error) {
  return await markImportAsFailed(ctx.importHistoryId, error);  // base oficial intacta
}
```

`registerImportUpload` **não é bloqueante**: sem Storage configurado, ou com
falha no upload, a importação segue e o motivo vai para `metadata.storageError`.
Perder a cópia do arquivo custa auditoria, não dado.

### Lotes

`DEFAULT_IMPORT_BATCH_SIZE = 500` (faixa útil 300–500). Em serverless com
`connection_limit=1`, uma transação longa segura a única conexão disponível e
derruba o resto do portal enquanto a planilha é processada — por isso o staging
é gravado em lotes, fora de transação, e só a aplicação final é transacional.

### Retorno padrão

```ts
{ success, importId, module, status, totalRows, validRows, ignoredRows, failedRows, message }
```

---

## 6. Respostas de API padronizadas

`src/lib/api-response.ts`

```
sucesso: { success: true,  data }
erro:    { success: false, error, details?, code? }
```

`ok` · `created` · `badRequest` · `unauthorized` · `forbidden` · `notFound` ·
`conflict` · `tooLarge` · `unsupportedMediaType` · `storageNotConfigured` ·
`serverError`

`errorMessage()` e `redactSecrets()` limpam o texto antes de ele sair do
servidor: erros de conexão do Prisma trazem a connection string inteira na
mensagem, e esse texto ia parar no navegador.

**As rotas antigas não foram migradas** — o front delas já espera o formato
atual. O helper vale para rotas novas (`/api/imports/*`) e para a migração do
PC-Factory na próxima etapa.

---

## 7. Tela

**Configurações → Histórico de Importações** (ADMIN/GESTOR) ganhou as colunas
*Válidas* e *Ignoradas* e um botão **Detalhes** por linha, que abre um modal com
resumo, contadores, erros do staging, metadata, caminho no bucket e download da
planilha original por URL assinada.

Rotas: `GET /api/imports/[id]` e `GET /api/imports/[id]/file`.

---

## 8. Índices

Migration `20260910000200_add_dashboard_composite_indexes`. Só entrou índice
cujo par (igualdade, range) aparece junto em consulta real do código:

| Tabela | Índice | Consulta |
|--------|--------|----------|
| `ServiceOrder` | `(status, openedAt)` | `critical-equipments/buildWhere` |
| `PurchaseRecord` | `(ignored, purchaseOrderDate)` · `(ignored, requisitionDate)` | `purchases/buildFilterWhere` |
| `PcFactoryRecord` | `(statusCategory, startDateTime)` · `(isMaintenanceKpi, startDateTime)` | `pc-factory/buildWhere` |
| `LubricantMovement` | `(movementCategory, movementDate)` | 6 consultas de `lubricants.service` |

Índice sobrando custa escrita em toda importação — a operação mais pesada do
portal. Por isso nada especulativo entrou.

> **Operacional:** `CREATE INDEX` sem `CONCURRENTLY` toma lock de escrita
> enquanto constrói. É intencional (o Prisma roda a migration em transação, e
> `CONCURRENTLY` não pode rodar dentro de uma). Aplique fora do horário de
> importação. Para uma tabela que cresça muito, crie o índice à mão com
> `CONCURRENTLY` antes — o `IF NOT EXISTS` torna a migration um no-op.

---

## 9. Summaries de dashboard — proposta, não implementada

A FASE 11 pedia para **avaliar** tabelas/views de resumo
(`PcFactoryMonthlySummary`, `PurchasePendingSummary`, …). **Nada foi
implementado**, por três motivos:

1. **Risco à regra oficial.** Os números do portal saem de regras não triviais
   (`isProgrammedPreventiveOrder`, classificação V3.1 de compras, buckets de
   disponibilidade do PC-Factory). Reescrevê-las em SQL de agregação cria uma
   **segunda fonte de verdade** que pode divergir em silêncio — e trocar o
   cálculo oficial sem validação está fora do escopo desta etapa.
2. **Não é o gargalo hoje.** Os dashboards filtram por colunas indexadas em
   tabelas de porte médio. O gargalo medido é a **conexão** (ver
   `docs/performance-conexoes-banco.md`), não a agregação.
3. **Custo de invalidação.** Um summary precisa ser reconstruído depois de toda
   importação; enquanto não for, o dashboard mostra número velho — e a tela
   passaria a precisar exibir "atualizado em".

**Quando reconsiderar:** se `PcFactoryRecord` passar de ~1 M de linhas, ou se um
dashboard passar de ~2 s no P95. A implementação deve então: reusar as funções
de regra existentes (não reescrevê-las em SQL), reconstruir o summary dentro da
**mesma transação** de `applyValidatedImport`, e exibir a data da última
reconstrução na tela.

---

## 10. Segurança — estado atual

| Item | Situação |
|------|----------|
| Service role só no servidor | ✅ `supabase-server.ts` tem guard de runtime (`typeof window`) |
| Nenhuma chave no bundle do cliente | ✅ verificado no build: 0 ocorrências de `service_role`, JWT, `postgresql://`, `AUTH_SECRET` em `.next/static` |
| Bucket de importações privado | ✅ criado com `public: false`; o script recusa bucket público |
| Arquivos acessíveis só por URL assinada | ✅ 5 min, atrás de ADMIN/GESTOR |
| RLS | ✅ habilitado em `ImportStagingRow`, como nas demais tabelas |
| Connection string em log/resposta | ✅ `redactSecrets()` na fronteira da API |
| Planilhas versionadas | ✅ `.gitignore` cobre `imports/**/*.{xlsx,xls,csv}` |

### Pendências conhecidas (não corrigidas nesta etapa)

1. **Chave anon versionada** em `src/lib/supabase-storage.ts`
   (`PUBLISHABLE_KEY_FALLBACK`). É pública por design e protegida por RLS, mas
   prende o portal a um projeto Supabase: rotacionar a chave exige deploy.
   **Correção:** definir `SUPABASE_ANON_KEY` na Vercel e no `.env` — o fallback
   deixa de ser usado — e então removê-lo do código.
2. **Stub do Prisma no bundle do cliente.** Componentes client importam
   `@/types/lubricants`, `@/types/pc-factory` etc., que carregam enums do
   `@prisma/client` em runtime. Entra apenas o stub que lança erro no navegador,
   sem credencial — mas é peso morto. **Correção:** mover os enums usados pela
   UI para constantes próprias. Fora do escopo desta etapa: mexer nesses
   arquivos toca as regras de Compras e PC-Factory.
3. **`prisma/dev.db`** (1,5 MB, resíduo da era SQLite) ainda está no diretório de
   trabalho. Não é versionado (`.gitignore` cobre `*.db`); pode ser apagado.
