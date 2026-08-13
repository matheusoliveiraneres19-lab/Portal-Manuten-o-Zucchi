# Conexões de banco e desempenho das páginas

> **APLICADO em 13/08/2026** — `connection_limit` foi elevado de **1 para 8** no
> `DATABASE_URL` de Production e Preview na Vercel. Os resultados medidos estão na
> seção "O que a medição mostrou", ao final, e **refutam parcialmente** a hipótese
> original registrada abaixo. Leia as duas partes.

## O achado

O `DATABASE_URL` do portal usa o **pooler transacional** do Supabase com:

```
...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

`connection_limit=1` significa que **o Prisma Client abre no máximo UMA conexão**.
As páginas do portal, porém, disparam muitas consultas em paralelo. A aba
PC-Factory é o caso extremo: `getPcFactoryPageData` executa um `Promise.all` com
oito ou mais chamadas (KPIs, linhas de produção, grupos, tendência, Pareto de
causa-raiz, registros, opções de filtro, qualidade de dados), e várias delas
fazem suas próprias consultas.

Com uma única conexão, **essas consultas paralelas viram fila**: o tempo total é
a soma de todas, não a da mais lenta. É a explicação mais provável para a
lentidão percebida na página.

### Como o problema apareceu

Durante a verificação das rotas (agosto/2026), o servidor local foi executado com
`connection_limit=3`. A aba PC-Factory falhou com:

```
Invalid `prisma.pcFactoryRecord.count()` invocation:
Timed out fetching a new connection from the connection pool.
(Current connection pool timeout: 10, connection limit: 3)
    at async Promise.all (index 7)
```

O `index 7` confirma o paralelismo: o oitavo item do `Promise.all` ficou sem
conexão disponível. Com `connection_limit=12`, a mesma página respondeu
normalmente. Ou seja: o gargalo é o tamanho do pool, não a query em si.

## Recomendação

Aumentar `connection_limit` no `DATABASE_URL` de **1** para algo entre **5 e 10**.

```
?pgbouncer=true&connection_limit=8&pool_timeout=20
```

Por que é seguro com o pooler transacional:

- em modo *transaction pooling*, o PgBouncer devolve a conexão ao servidor no fim
  de cada transação, então N conexões do Prisma **não** consomem N conexões
  Postgres de forma permanente;
- `pgbouncer=true` já desativa prepared statements, que é a incompatibilidade
  clássica desse modo.

Pontos de atenção antes de aplicar:

1. **Limite do plano Supabase.** Conferir o teto de conexões do pooler no projeto.
   O cálculo é `connection_limit x número de instâncias serverless simultâneas`.
   Comece em 5 e observe.
2. **Fluid Compute na Vercel.** Como instâncias são reaproveitadas entre
   requisições concorrentes, um pool pequeno é ainda mais penalizante — mais um
   argumento para sair de 1.
3. **`pool_timeout`.** O padrão de 10s é curto para uma página com muitas queries;
   20s dá folga sem mascarar problema real.
4. **Medir depois.** Comparar o tempo de resposta de `/dashboard/pc-factory` antes
   e depois. Se não melhorar, o gargalo está na query e não no pool — nesse caso
   o próximo passo é `EXPLAIN ANALYZE` nas agregações de `PcFactoryRecord`.

## Nota sobre desenvolvimento local

Na rede da Zucchi a **porta 6543 (pooler transacional) está bloqueada**; só a
**5432 (pooler de sessão)** responde. Verificação feita em agosto/2026:

```
Test-NetConnection aws-1-us-west-2.pooler.supabase.com -Port 6543  ->  False
Test-NetConnection aws-1-us-west-2.pooler.supabase.com -Port 5432  ->  True
```

Consequência: `npm run dev` não consegue ler o banco com o `DATABASE_URL` de
produção, e todas as páginas caem em estado vazio ("dados indisponíveis").

Para desenvolver localmente contra o banco real, aponte `DATABASE_URL` para a
porta 5432 **apenas no `.env` local** (o `DIRECT_URL` já usa essa porta):

```
DATABASE_URL="<mesma URL do DIRECT_URL>?connection_limit=8"
```

Não altere o valor na Vercel: lá o 6543 é o correto para serverless.

## Índices: não adicionar

Registro para evitar retrabalho. O schema **já é fortemente indexado** — só
`PurchaseRecord` tem 24 índices de coluna única. Acrescentar mais degradaria a
importação, porque cada `insert` passa a atualizar mais árvores.

Se surgir uma consulta lenta comprovada por `EXPLAIN ANALYZE`, o caminho é um
índice **composto** que cubra exatamente aquele filtro — nunca mais índices de
coluna única.

---

## O que a medição mostrou (13/08/2026)

`connection_limit` foi elevado de 1 para 8 em Production e Preview, e o mesmo commit
foi redeployado para a variável passar a valer. Medições em produção, requisições
autenticadas já aquecidas, mediana de 3–4 amostras:

| Rota | limit=1 | limit=8 | ganho |
|---|---|---|---|
| `/dashboard/ordens-servico` | 1,02–1,21s | ~0,78s | ~30% |
| `/dashboard/lubrificantes` | 0,71–0,92s | ~0,60s | ~22% |
| `/dashboard/compras-pendentes` | 0,88–0,94s | ~0,75s | ~18% |
| `/dashboard/equipamentos-criticos` | 1,69–1,82s | ~1,60s | ~8% |
| `/dashboard/pc-factory` | 4,14–4,28s | ~3,84s | ~7% |
| `/dashboard` | 3,34s | ~3,23s | ~3% |

### A hipótese original estava parcialmente errada

A previsão era que o pool de UMA conexão fosse o gargalo principal justamente das
duas rotas mais pesadas, porque são as que mais abrem queries em paralelo. A medição
diz o contrário: **home e PC-Factory melhoraram apenas 3–7% e seguem em 3–4s**,
enquanto o ganho maior (18–30%) apareceu nas rotas que já respondiam em menos de
1,3s.

Leitura correta: a contenção de conexão existia e custava algo, mas o custo
DOMINANTE em home e PC-Factory é o **trabalho da própria query**, não a espera por
conexão. Ampliar o pool foi útil e deve ser mantido — só não era o gargalo que se
supunha.

Cautela sobre os números: houve variação entre amostras (uma medição de
`equipamentos-criticos` deu 2,30s contra mediana de ~1,6s). Trate os ganhos como
ordem de grandeza, não como precisão de milissegundo.

### Próximo passo real, se a lentidão de home/PC-Factory incomodar

O caminho agora é a query, não a conexão:

1. `loadRecords` (`pc-factory.service.ts`) faz `findMany` de TODOS os
   `PcFactoryRecord` do recorte e agrega em JavaScript. Para um período largo isso
   trafega e processa muita linha. Medir com `EXPLAIN ANALYZE` e avaliar mover a
   agregação para SQL (`groupBy` do Prisma ou view materializada).
2. A home chama `getPcFactoryMachinesBelowAverage`, que depende do mesmo
   `loadRecords` — é por isso que ela acompanha o PC-Factory no tempo de resposta.
3. Só depois disso considerar índice composto, e apenas para o filtro comprovado
   pelo `EXPLAIN` (ver a seção "Índices: não adicionar").
