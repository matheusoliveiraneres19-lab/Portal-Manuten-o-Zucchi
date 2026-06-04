# Portal de Manutenção Zucchi

Portal interno de gestão da manutenção da Granito Zucchi: dashboard de indicadores,
ordens de serviço, compras, materiais, lubrificantes, equipamentos críticos, alertas,
procedimentos e apontamento de horas da equipe.

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) + React 18 + TypeScript
- [Prisma ORM](https://www.prisma.io/) com banco **SQLite** (`prisma/dev.db`)
- [Tailwind CSS](https://tailwindcss.com/) + [Recharts](https://recharts.org/) + [lucide-react](https://lucide.dev/)

## Pré-requisitos

- Node.js 20+ (testado com Node 24)
- npm 10+

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de ambiente a partir do exemplo
#    (no Windows PowerShell: Copy-Item .env.example .env)
cp .env.example .env

# 3. Gerar o Prisma Client e aplicar as migrações
npx prisma generate
npx prisma migrate dev

# 4. Popular o banco com dados de exemplo
npm run db:seed

# 5. Subir em desenvolvimento
npm run dev
```

App disponível em http://localhost:3000

### Credenciais de exemplo (somente desenvolvimento)

| Login        | Senha      | Perfil        |
|--------------|------------|---------------|
| `admin`      | `admin123` | Administrador |
| `manutencao` | `admin123` | Gestor        |
| `joao.silva` | `admin123` | Técnico       |

> ⚠️ A autenticação atual é **temporária para desenvolvimento** (senha em texto puro,
> cookie de sessão fixo). **Antes de expor o portal na internet**, implementar hash de
> senha (bcrypt) e sessão assinada/segura — ver `src/app/api/auth/login/route.ts`.

## Scripts

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção (após `build`) |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Prisma Studio (visualizador do banco) |
| `npm run db:seed` | Popula o banco com dados de exemplo |
| `npm run import:service-orders` | Importa ordens de serviço (SAP/Excel) |

## Banco de dados

O banco SQLite (`prisma/dev.db`) **não é versionado** — é recriado localmente via
`npx prisma migrate dev` + `npm run db:seed`. O schema fica em `prisma/schema.prisma`.

## Deploy

> **Atenção:** SQLite exige disco persistente. Funciona em VPS / servidor interno /
> Docker / Railway / Render (com disco). **Não funciona em serverless** (ex.: Vercel)
> sem migrar para Postgres. Ver seção de deploy ao escolher a plataforma.

## Estrutura

```
src/
  app/            Rotas (App Router): login, dashboard, módulos, API
  components/     Componentes de UI (dashboard, login, cards, gráficos)
  services/       Regras de negócio e acesso ao banco (Prisma)
  data/           Dados mockados de fallback
  lib/            Prisma client, auth helpers
  types/          Tipagens
  utils/          Formatadores, normalização de importação
prisma/           Schema, migrações e seed
docs/             Documentação técnica (importação Excel/SAP)
```
