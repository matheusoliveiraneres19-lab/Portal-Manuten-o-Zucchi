# Conexões de banco e desempenho das páginas

Documento de recomendação. **Nada aqui foi aplicado** — mexer em `DATABASE_URL` é
mudança de infraestrutura (painel da Vercel + `.env` local) e deve ser feita por
quem administra o projeto.

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
