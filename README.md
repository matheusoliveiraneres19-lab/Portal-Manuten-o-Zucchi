# Portal de Manutenção Zucchi

Portal interno de gestão da manutenção da Granito Zucchi: dashboard de indicadores,
ordens de serviço, compras, materiais, lubrificantes, equipamentos críticos, alertas,
procedimentos e apontamento de horas da equipe.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18 + TypeScript
- [Prisma ORM](https://www.prisma.io/) sobre **PostgreSQL (Supabase Pro)**
- **Supabase Storage** (buckets privados) para anexos e planilhas de importação
- [Tailwind CSS](https://tailwindcss.com/) + [Recharts](https://recharts.org/) + [lucide-react](https://lucide.dev/)
- Deploy em **Vercel** (`vercel.json`, região `pdx1`)

## Pré-requisitos

- Node.js 20+ (a Vercel roda Node 24, ver `engines` no `package.json`)
- npm 10+
- Acesso ao projeto Supabase (connection strings e chaves)

## Setup local

```bash
# 1. Instalar dependências (o postinstall já roda "prisma generate")
npm install

# 2. Criar o arquivo de ambiente a partir do exemplo
#    (Windows PowerShell: Copy-Item .env.example .env)
cp .env.example .env
#    Preencher DATABASE_URL, DIRECT_URL e AUTH_SECRET. Ler os comentários do
#    .env.example: na rede da Zucchi a porta 6543 é bloqueada, então LOCALMENTE
#    o DATABASE_URL deve apontar para a porta 5432 (a mesma do DIRECT_URL).

# 3. Aplicar as migrações pendentes
npx prisma migrate deploy

# 4. Subir em desenvolvimento
npm run dev
```

App disponível em http://localhost:3000

> `npm run db:seed` popula um banco VAZIO com dados de exemplo. **Nunca rode
> contra o banco de produção** — o portal já tem dados reais.

### Autenticação

Senhas com hash **bcrypt** e sessão assinada em **HMAC-SHA256** (`AUTH_SECRET`,
obrigatório — sem ele ninguém loga). O fallback `admin/admin123` só existe fora
de produção e apenas com `ALLOW_AUTH_FALLBACK=true`.
Ver `src/lib/auth.ts`, `src/lib/session.ts` e `src/lib/password.ts`.

## Scripts

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção (após `build`) |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Prisma Studio (visualizador do banco) |
| `npm run storage:setup-imports` | Cria/confere o bucket privado `portal-imports` |
| `npm run import:service-orders` | Importa ordens de serviço (SAP/Excel) |
| `npm run import:purchases` | Importa a base de compras |
| `npm run import:pc-factory` | Importa apontamentos do PC-Factory |
| `npm run import:lubricants` | Importa a planilha de lubrificação (SAP/Fiori, aba `Data`) |
| `npm run import:functional-locations` | Importa os locais de instalação |

## Banco de dados

PostgreSQL gerenciado pelo **Supabase**. Duas connection strings, e a distinção
importa:

| Variável | Porta | Uso |
|----------|-------|-----|
| `DATABASE_URL` | 6543 (pooled/pgbouncer) | runtime da aplicação — obrigatório em serverless |
| `DIRECT_URL` | 5432 (direta) | migrations, seed e scripts de importação |

Migrações em `prisma/migrations`, aplicadas com **`npx prisma migrate deploy`**.

> ⚠️ **Nunca** rodar `prisma migrate reset` — apaga a base inteira.
> `prisma migrate dev` também é para banco de desenvolvimento apenas: ele
> compara com um shadow database e pode propor recriar objetos.

Detalhes de conexão e medições em `docs/performance-conexoes-banco.md`.

## Importações

Infraestrutura descrita em `docs/supabase-pro-importacoes.md`: bucket privado
das planilhas, histórico (`ImportHistory`), staging (`ImportStagingRow`) e o
orquestrador que só toca a base oficial depois da validação completa.

O histórico fica visível em **Configurações → Histórico de Importações**
(ADMIN/GESTOR), com detalhes por importação e download da planilha original.

## Deploy

**Vercel** (`vercel.json`). Variáveis de ambiente obrigatórias em
Settings → Environment Variables:

| Variável | Obrigatória | Vai para o cliente? |
|----------|-------------|---------------------|
| `DATABASE_URL` | sim | **não** |
| `DIRECT_URL` | sim | **não** |
| `AUTH_SECRET` | sim | **não** |
| `SUPABASE_URL` | para Storage | não (pública por natureza, mas não é inlinada) |
| `SUPABASE_SERVICE_ROLE_KEY` | para Storage | **NUNCA** |
| `SUPABASE_STORAGE_BUCKET_IMPORTS` | opcional | não |

Qualquer variável com prefixo `NEXT_PUBLIC_` é **inlinada no bundle do
navegador** pelo Next. Nunca dar esse prefixo à service role key.

## Estrutura

```
src/
  app/            Rotas (App Router): login, dashboard, módulos, API
  components/     Componentes de UI (dashboard, login, cards, gráficos)
  services/       Regras de negócio e acesso ao banco (Prisma)
    importacao/   Importadores por módulo (PC-Factory, Compras, OS, …)
  data/           Dados mockados de fallback
  lib/            Prisma client, auth, Supabase server/admin, respostas de API
  types/          Tipagens
  utils/          Formatadores, normalização de importação
prisma/           Schema, migrações e seed
scripts/          CLI de importação, manutenção e setup
docs/             Documentação técnica
```
