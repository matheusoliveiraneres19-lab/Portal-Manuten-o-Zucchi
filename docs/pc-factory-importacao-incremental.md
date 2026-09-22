# PC-Factory — Importação incremental

> Implementado em 2026-09-21. Importar um mês novo **deixa de apagar** os meses
> já carregados. A operação passa a ser mensal e cumulativa.

## 1. O que acontecia antes

Toda importação começava apagando a tabela inteira:

| Onde | Código |
|---|---|
| `pc-factory-staging.service.ts` (fluxo principal, staging) | `await tx.pcFactoryRecord.deleteMany({})` dentro da transação |
| `pc-factory-import.service.ts` (caminho direto/CLI) | `if (options.replaceAll) await prisma.pcFactoryRecord.deleteMany({})` |
| `api/pc-factory/import/route.ts` | chamava o caminho direto com `replaceAll: true` |

**O delete não tinha filtro nenhum** — nem período, nem lote, nem máquina. A
base era, por construção, um retrato do *último* arquivo importado. Importar
setembro produzia uma base só com setembro.

Os registros eram inseridos com `createMany({ skipDuplicates: true })` em lotes
de 500, e a identidade de um evento era `technicalKey`. Nos layouts XLSX essa
chave embutia **o número da linha do Excel**:

```ts
orderNumber: [orderNumber ?? operationCode ?? "", endDateTime?.toISOString() ?? "", String(line)].join("#")
```

Ou seja: o mesmo evento reexportado em outra posição da planilha gerava outra
chave. A chave não servia para deduplicar entre arquivos — só funcionava porque
a base era apagada antes.

## 2. O que passou a valer

```text
arquivo → validar → staging → PRÉVIA (período, novos, já existentes) →
confirmação do operador → aplicar
```

Dois modos (`src/types/pc-factory-import-mode.ts`):

| Modo | O que faz | Quando |
|---|---|---|
| **INCREMENTAL** (padrão) | Só insere. **Nada é apagado.** Eventos já presentes são pulados pelo banco. | Operação mensal normal |
| **REPLACE_PERIOD** | Apaga **somente** `startDateTime` entre o primeiro e o último início do arquivo, e reinsere. | Corrigir um mês importado errado |

Não existe mais nenhum modo "apagar tudo" na operação. Modo ausente, inválido ou
com erro de digitação cai em INCREMENTAL — o caminho que apaga algo só é tomado
quando pedido explicitamente. O reset total continua possível apenas por
`scripts/reset-pc-factory.ts`, que agora **exige a flag `--sim-apagar-tudo`**.

## 3. Fingerprint — a identidade de um evento

`src/utils/pc-factory-fingerprint.ts` · coluna `PcFactoryRecord.fingerprint` (única)

```text
sha1( recurso | statusCode | status | início | fim | duração | ordem | operação | ordinal )
```

**Entra:** o que define o evento. **Não entra, de propósito:**

- o **número da linha do Excel** — muda a cada reexportação (era o defeito da `technicalKey`);
- o **nome do arquivo / lote** — reimportar o mesmo mês com outro nome não pode criar registros novos;
- **responsáveis, operador, observação, causa raiz** — são editáveis na origem; se entrassem, corrigir o responsável no PC-Factory faria o evento reaparecer como se fosse outro.

O **ordinal** resolve o caso do requisito 12: duas linhas com máquina, status,
início, fim, duração, ordem e operação *todos* iguais são eventos legítimos
distintos e precisam ser contadas separadamente. Ele conta a repetição da tupla
(0, 1, 2…), **não** a posição no arquivo — repetições são indistinguíveis entre
si, então reordenar o arquivo produz o mesmo conjunto de chaves. Na base real
isso vale para **136 tuplas** de 71.059: sem o ordinal, 136 eventos reais
sumiriam.

Nunca deduplicar por máquina+duração ou máquina+status: uma máquina tem dezenas
de paradas mecânicas de 30 min no mês, todas legítimas. O que as separa é o
instante.

### Backfill obrigatório

Os 71.195 registros anteriores tinham `fingerprint = NULL`, e no PostgreSQL um
índice UNIQUE aceita vários NULLs — sem o backfill, a primeira reimportação de
um mês já carregado inseriria tudo de novo. `npm run backfill:pc-factory-fingerprint`
recalcula a chave a partir das **colunas já persistidas** (nenhuma planilha é
relida), pela mesma função da importação. Rodado em 2026-09-21: 71.195
fingerprints, todas únicas, 0 NULL, 0 registros perdidos.

## 4. Tela de confirmação

`POST /api/pc-factory/import/preview` mede, **sem escrever**: período detectado,
linhas válidas, novos registros, já existentes e quantos a base já tem naquela
janela. O modal para aí e mostra:

```text
Arquivo: G0015_2026-09.xlsx
Período detectado: 01/09/2026 a 30/09/2026 (set/2026)
Linhas válidas: 7.842   Novos: 7.842   Já existentes: 0
Histórico anterior: SERÁ PRESERVADO
                                              [Adicionar set/2026]
```

Quando o período já tem dados, aparece o alerta e o segundo botão
**“Substituir somente este período”** — e só ele. Apagar o histórico completo
não é oferecido em lugar nenhum da tela.

**Base acumulada (requisito 7):** se o arquivo cobre mais de um mês, o painel diz
com todas as letras quantos meses são e que substituir apagaria *todos* eles.
Min/max nunca é tratado automaticamente como "só o último mês".

**Linhas sem data** ficam fora do delete por período (não pertencem a janela
nenhuma) e são resolvidas pela deduplicação. O painel informa quantas são.

## 5. Eventos que cruzam o mês

Um evento 31/08 22:00 → 01/09 06:00 é gravado **bruto**, como sempre. A
importação não segmenta nem reinterpreta nada. O período do arquivo é medido por
`startDateTime` — a mesma data que o modo oficial (G0134) já usa para dizer a
que mês um registro pertence. Os cálculos não mudaram.

## 6. O que NÃO mudou

Fórmula da Disponibilidade Física, classificação de status, Horas de Parada,
bloqueio de recursos legados (roda no parser, antes do staging), filtro Grupo de
Área, justificativas de disponibilidade, e as tabelas de Ordens de Serviço,
Compras, Lubrificantes, Preventivas, Procedimentos e Usuários.

## 7. Arquivos

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | + `PcFactoryRecord.fingerprint` (único, nullable) |
| `prisma/migrations/20260921120000_pcfactory_incremental_import/` | ADD COLUMN + índice único, aditivo e idempotente |
| `src/utils/pc-factory-fingerprint.ts` | **novo** — fingerprint determinística (server-only: usa `node:crypto`) |
| `src/types/pc-factory-import-mode.ts` | **novo** — modos, período detectado, prévia |
| `src/services/importacao/pc-factory-staging.service.ts` | delete global **removido**; `detectStagingPeriod`, `previewPcFactoryImport`, `finish` com modo |
| `src/services/importacao/pc-factory-import.service.ts` | fingerprint no build; `persistRecords` por fingerprint; `replaceAll` neutralizado |
| `src/app/api/pc-factory/import/preview/route.ts` | **novo** |
| `src/app/api/pc-factory/import/finish/route.ts` | aceita `mode` |
| `src/app/api/pc-factory/import/route.ts` | não passa mais `replaceAll` |
| `src/components/pc-factory/PcFactoryImportModal.tsx` | etapa de confirmação, escolha de modo, resultado com “removidos” |
| `src/components/configuracoes/AdminPanels.tsx` | histórico com Período, Modo e Removidos por lote |
| `scripts/backup-pc-factory.ts` | **novo** — dump NDJSON + contagem por mês |
| `scripts/backfill-pcfactory-fingerprint.ts` | **novo** |
| `scripts/validate-pcfactory-incremental-import.ts` | **novo** — teste crítico |
| `scripts/reset-pc-factory.ts` | exige `--sim-apagar-tudo` |

## 8. Runbook

> ⚠️ Banco por migrations do **Supabase**. Nunca `prisma migrate reset`. O pooler
> (`:6543`) está bloqueado nesta rede — use `DIRECT_URL`.

```bash
# 0. Backup (vai para .backups/, fora do Git) + contagem por mês
npm run backup:pc-factory

# 1. Migration (ADD COLUMN + índice; aditiva e idempotente)
DATABASE_URL="$(grep -E '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')" \
  npx prisma db execute \
    --file prisma/migrations/20260921120000_pcfactory_incremental_import/migration.sql \
    --schema prisma/schema.prisma

# 2. Backfill das fingerprints (confira antes com --dry-run)
npx tsx --env-file=.env scripts/backfill-pcfactory-fingerprint.ts --dry-run
npx tsx --env-file=.env scripts/backfill-pcfactory-fingerprint.ts

# 3. Teste crítico (usa um mês sintético e limpa o que cria)
npm run validate:pc-factory-incremental
```

O passo 2 é **obrigatório** e deve rodar logo após o 1: entre um e outro, uma
reimportação duplicaria registros.
