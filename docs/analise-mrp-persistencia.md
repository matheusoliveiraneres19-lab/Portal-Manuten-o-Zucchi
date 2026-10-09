# Análise MRP — persistência (FASE B)

Migração do `Analise_MRP_Compacto (1).html` para o Portal. O HTML é a **fonte de
verdade funcional**; esta fase cria apenas a infraestrutura de banco. Telas,
importação, motor e exportações ficam para as fases C em diante.

O HTML **não** fica no repositório (1,6 MB, com o SheetJS em base64). Os scripts
leem a cópia local, que fica por padrão em
`OneDrive - granitozucchi.com.br/Manutenção - Documentos Manutenção/Restrito/Manutenção/MRP Sap novo/`.
Também é possível informar outro caminho com `--html="..."` ou com a variável `MRP_HTML_REF`.

## Modelos

| Modelo | Papel | Equivalente no HTML |
|---|---|---|
| `MrpBaseVersion` / `MrpBaseMaterial` | Base MRP versionada (uma única versão ativa) | `SEED_MAN`/`SEED_ELE` ou `baseCustom` |
| `MrpStockImport` / `MrpStockItem` | Estoque importado (um registro por código) | `estoque` |
| `MrpPurchaseImport` / `MrpPurchaseItem` | Compras importadas (sem deduplicação; `seq` = `c.i`) | `compras` |
| `MrpAnalysisRun` / `MrpAnalysisItem` | Cada execução de `analisar()` e o resultado por material | `analysis` |

Também foram reaproveitados:
- `ImportHistory`, com os tipos novos `MRP_BASE`, `MRP_STOCK` e `MRP_PURCHASES`. A FK é `ON DELETE SET NULL`.
- `PortalSetting`, com a chave `mrp/deposito_padrao`.

As tabelas `Purchase`, `PurchaseRecord`, `Material` e `MaterialMovement` não foram tocadas. A importação diária de compras também não, conforme o item 50 do escopo.

## Invariantes garantidas pelo banco

- **No máximo uma `MrpBaseVersion` ativa:** índice único parcial `MrpBaseVersion_single_active_key`.
- **No máximo uma `MrpAnalysisRun` com `isCurrent`:** índice único parcial `MrpAnalysisRun_single_current_key`.
- **Troca atômica:** `activateMrpBaseVersion` e `setCurrentMrpAnalysisRun` (em `src/services/mrp-persistence.service.ts`) desativam a versão anterior e ativam a nova numa só transação. Se qualquer passo falhar, tudo é revertido e a anterior continua valendo.
- **Versão incompleta:** uma versão com menos materiais do que `materialCount` não pode ser ativada.
- **Uma análise preserva suas fontes:** base, estoque e compras referenciados por uma `MrpAnalysisRun` não podem ser apagados (FK `RESTRICT`).

Essa troca atômica é a **única mudança de comportamento** em relação ao HTML. O HTML gravava a base nova antes de validar o estoque.

## Decisão Float × Decimal: Decimal(65,30)

Medida com `npm run test:mrp-precision`, usando o `parseNum` original do HTML, 54 valores distintos e todos os mín/máx da base embutida:

| Caminho | Divergências |
|---|---|
| `Decimal` gravado via `toMrpDecimal(v)` (**adotado**) | só o `-0` |
| `Decimal` gravado com `number` cru (controle negativo) | `0.30000000000000004` → `0.3`, `434.99999999999994` → `434.9999999999999`, `-0` |
| `Float` pelo ORM (medido com uma sonda manual) | perde o último bit **na gravação e na leitura** |

**Por que o Float não serve:** o servidor (PostgreSQL 17.6 / Supabase) roda com `extra_float_digits = 0`, então o float8 trafega como texto de 15 dígitos.

**Regra obrigatória:** toda quantidade MRP é gravada com `toMrpDecimal(v)` e lida com `fromMrpDecimal(d)`, ambas em `mrp-persistence.service.ts`. Passar o `number` cru ao Prisma corta o valor.

**Limitação conhecida:** `-0` (que o `parseNum` do HTML produz com o texto "-0") vira `0`.
- Não afeta nenhuma regra: `livre <= 0`, a quantidade sugerida e os KPIs dão o mesmo resultado.
- Só a exibição muda: o HTML mostraria "-0" na coluna Saldo.
- O comparador de paridade (FASE K) deve tratar `-0` e `0` como iguais e listar esses casos à parte.

Os campos `sum`/`avg` devem ser calculados em JS, na mesma ordem do HTML, e não com `SUM()` no SQL. Somas em numeric são exatas e as do HTML são em double, então os resultados podem diferir.

## Outras convenções de paridade

- **Datas de compra:** texto ISO `YYYY-MM-DD` ou `""`. O `cmpOrdem()` compara a chave como string, e nenhum `DateTime` participa do motor.
- **Códigos de material:** gravados como o `cleanCode()` do HTML devolve, **sem** remover zeros à esquerda.
- **Status, origem (`SEED_HTML`/`UPLOAD`) e gatilho** (`FULL_UPDATE`/`BASE_REIMPORT`/`BASE_RESTORE`): campos `String`, sem enum no PostgreSQL.

## Depósito

| Nível | Onde fica |
|---|---|
| Padrão do sistema | `PortalSetting` `mrp/deposito_padrao` = `"1400"` (`getMrpDefaultDeposit()`) |
| Valor usado em cada análise | `MrpStockImport.depositFilter` e `MrpAnalysisRun.depositFilter` (obrigatórios) |
| Preferência por usuário | **Não existe** estrutura de preferência por usuário no portal (`User` não tem campo para isso). Fica para uma fase posterior, sem criar um sistema de `UserSettings` agora |

## Seed: base embutida do HTML

```bash
npm run seed:mrp-html-base -- --dry-run   # só confere
npm run seed:mrp-html-base                # grava (idempotente)
```

- **Linhas brutas:** Mecânica 3.485, Elétrica 795, total 4.280.
- **Deduplicação:** 0 duplicados e 0 linhas sem código, então ficam 4.280 materiais.
- **Paridade:** comparado campo a campo com o `materiais()` original do HTML, com 0 divergências antes de gravar e 0 depois de gravar.
- **Versão criada:** `source = SEED_HTML`, `fileName = Analise_MRP_Compacto (1).html`, ativa. O `metadata` guarda o sha256 do HTML, as contagens por área e por conjunto e o total sem mín/máx.

## Migrations

O banco é do Supabase e **não** usa `prisma migrate` (ver `docs/pc-factory-tabela-gerencial.md`). As migrations são aplicadas com `prisma db execute` pela conexão direta, na ordem abaixo:

```bash
npx prisma db execute --url "$DIRECT_URL" --file prisma/migrations/20261007000000_add_import_type_mrp/migration.sql
npx prisma db execute --url "$DIRECT_URL" --file prisma/migrations/20261007000100_add_mrp_analysis_tables/migration.sql
npx prisma db execute --url "$DIRECT_URL" --file prisma/migrations/20261007000200_mrp_quantities_decimal/migration.sql
```

As três são aditivas e idempotentes: reaplicá-las não muda nada. Depois da aplicação, `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma` acusa "No difference detected".

## Regras registradas para as fases seguintes

- **`ALIAS.rec`:** `datarecebimento`, `datadorecebimento`, `dataderecebimento`, `recebimento`, `dataentrega`.
- **KPI "Saíram do MRP"** (FASE D/E):
  - `retirados` = os materiais com `status === "Comprado"`;
  - o valor do KPI é `retirados.length`;
  - "qtd. evitada" = soma de `sugeridaOrig` desses mesmos materiais.

## Testes

```bash
npm run test:mrp-precision      # Float × Decimal
npm run test:mrp-persistence    # seed, unicidade, FKs, ativação/rollback, índices parciais
npm run mrp:db-counts           # contagens das tabelas existentes (antes/depois)
```

Nesta rede o pooler `:6543` costuma estar bloqueado. Para rodar os scripts, use `DATABASE_URL=<DIRECT_URL>?connection_limit=1`.

O `test:mrp-persistence` grava só nas tabelas MRP, além de uma linha de `ImportHistory`. Tudo leva a marca `createdBy`/`importedBy = scripts/mrp/test-mrp-persistence.ts` e é apagado no fim, e a versão ativa original é restaurada.
