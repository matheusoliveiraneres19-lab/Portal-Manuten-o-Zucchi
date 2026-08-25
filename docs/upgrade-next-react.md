# Upgrade do Next.js / React — planejado, NÃO executado

> **Status em 25/08/2026:** decidido ADIAR. O checkup de 25/08 fechou todos os
> demais achados; este ficou de fora porque é upgrade de **major** em duas
> dependências de base (Next e React) e muda o perfil de risco do deploy.
> Este documento existe para o trabalho não ter que ser redescoberto.

## Por que mexer

`next@14.2.35` acumula **21 advisories** (`npm audit`), das quais 6 de
severidade alta atingem justamente o App Router, que é o que o portal usa:

| Advisory | Severidade | Corrige em |
|---|---|---|
| DoS em Server Actions (GHSA-m99w-x7hq-7vfj) | alta | 15.5.21 |
| SSRF em Server Actions em servidor custom (GHSA-89xv-2m56-2m9x) | alta | 15.5.21 |
| SSRF em rewrites via hostname controlado (GHSA-p9j2-gv94-2wf4) | alta | 15.5.21 |
| DoS com Server Components (GHSA-q4gf-8mx6-v5v3 / GHSA-8h8q-6873-q5fj) | alta | 15.5.16 |
| Bypass de middleware/proxy com i18n (GHSA-36qx-fr4f-26g5) | alta | 15.5.16 |
| Deserialização de request → DoS em RSC (GHSA-h25m-26qc-wcjf) | alta | 15.0.8 |

Mais 15 de severidade moderada/baixa (cache poisoning e cache confusion em RSC,
XSS com nonce de CSP, DoS no Image Optimizer, disclosure de endpoints de Server
Function). **O maior limite inferior é `15.5.21`** — essa é a versão mínima que
zera a lista inteira. O `npm audit fix --force` propõe `16.3.3`.

### Exposição real (por que deu para adiar)

Quase tudo é **DoS** ou **cache poisoning**, e o portal é interno: 14 usuários,
tudo atrás de login, na Vercel. Não é "sem risco", é risco baixo o suficiente
para caber numa janela planejada em vez de um upgrade às pressas. As duas
advisories que preocupariam mais num portal público (SSRF em rewrites e bypass
de middleware com i18n) não se aplicam: o portal **não usa i18n** e **não tem
rewrites** (o `next.config.mjs` só define `distDir`, `poweredByHeader` e
`headers`).

## O que o upgrade arrasta

Next 15+ exige **React 19** no App Router (hoje: `react@18.3.1`). A boa notícia
é que as bibliotecas visuais já estão prontas — verificado em 25/08/2026 nos
`peerDependencies` instalados:

- `recharts@2.15.4` já declara `react: ^16 || ^17 || ^18 || ^19` — **não precisa
  subir para a linha 3.x**;
- `framer-motion@12` já suporta React 19.

Ou seja: são dois upgrades encadeados (Next + React), não três. Ainda assim, os
gráficos são o que merece mais atenção na validação visual, porque React 19
mudou o comportamento de refs e de efeitos em StrictMode.

## Superfície de código medida (25/08/2026)

Em Next 15, `params`, `searchParams`, `cookies()`, `headers()` e `draftMode()`
passam a ser **assíncronos**. Levantamento exato:

**9 route handlers** com `{ params }: { params: {...} }` → virar `Promise` e `await`:

```
src/app/api/collaborators/[id]/attachments/route.ts
src/app/api/collaborators/[id]/attachments/[attId]/route.ts
src/app/api/collaborators/[id]/epis/route.ts
src/app/api/collaborators/[id]/epis/[epiId]/route.ts
src/app/api/collaborators/[id]/tools/route.ts
src/app/api/collaborators/[id]/tools/[toolId]/route.ts
src/app/api/settings/[category]/route.ts
src/app/api/settings/[category]/[key]/route.ts
src/app/api/users/[id]/route.ts
```

**10 páginas** com `searchParams`:

```
src/app/page.tsx
src/app/dashboard/page.tsx
src/app/dashboard/geral/page.tsx
src/app/dashboard/compras-pendentes/page.tsx
src/app/dashboard/compras-realizadas/page.tsx
src/app/dashboard/equipamentos-criticos/page.tsx
src/app/dashboard/lubrificantes/page.tsx
src/app/dashboard/ordens-servico/page.tsx
src/app/dashboard/pc-factory/page.tsx
src/app/dashboard/preventivas-programadas/page.tsx
```

**3 páginas** com `params`:

```
src/app/dashboard/[module]/page.tsx
src/app/dashboard/equipe/[id]/page.tsx
src/app/dashboard/procedimentos/[slug]/page.tsx
```

**3 usos de `cookies()`**:

```
src/app/login/page.tsx
src/app/primeiro-acesso/page.tsx
src/lib/auth-guard.ts        <- crítico: é o guard de sessão de TODA a API
```

Total: **25 arquivos**. É trabalho mecânico, e o `codemod` oficial
(`npx @next/codemod@canary next-async-request-api .`) cobre a maior parte — mas
`auth-guard.ts` merece revisão manual, porque um `await` esquecido ali degrada
silenciosamente a checagem de sessão em vez de quebrar o build.

Atenção também à mudança de **cache**: em Next 15 o `fetch` e os handlers `GET`
deixam de ser cacheados por padrão. O portal usa Prisma direto (não `fetch`) e
já marca as rotas com `dynamic = "force-dynamic"`, então o impacto esperado é
nulo — mas é o tipo de coisa que só a validação com banco real confirma.

## Roteiro sugerido

1. Branch dedicada. **Não** fazer junto de mudança funcional.
2. `npm i next@15 react@19 react-dom@19` (+ `@types/react@19 @types/react-dom@19`).
   O `recharts` fica onde está — já aceita React 19.
3. Rodar o codemod, depois revisar `auth-guard.ts` à mão.
4. `npx tsc --noEmit` → `npx next lint` → `npm run build`.
5. Rodar as três suítes: `test:purchases`, `test:purchases-v31`, `test:purchases-key`.
6. **Validar com o banco real, módulo por módulo** — especialmente os gráficos
   (React 19 mudou refs/StrictMode) e o login/primeiro acesso (cookies async).
   Para isso o `DATABASE_URL` local precisa apontar para a porta 5432 (ver
   `docs/performance-conexoes-banco.md`).
7. Deploy em Preview na Vercel antes de Production.

## Outras dependências ainda em aberto

O checkup de 25/08 rodou `npm audit fix` (sem `--force`), o que derrubou o total
de **19 para 8** vulnerabilidades sem alterar nenhuma versão declarada no
`package.json` — só transitivas no lockfile. O `xlsx` foi resolvido à parte,
migrando para o tarball oficial do SheetJS (ver abaixo). Restam **6 altas**,
todas exigindo major:

| Pacote | Situação |
|---|---|
| `next` | este documento |
| `sharp` | 0.34 → **0.35** (CVEs herdadas da libvips). Upgrade isolado e de baixo risco; só é usado pelo pipeline de imagem do Next e pelo Remotion. Candidato a fazer antes do Next. |
| `prisma` / `@prisma/config` | 6.19 → **8.x**. Major com mudanças de config (o warning de `package.json#prisma` deprecado já aparece hoje; a v7 pede `prisma.config.ts`). |
| `postcss`, `deepmerge-ts` | transitivas sob `remotion`/`prisma` — resolvem junto com os pais acima. |

### Nota sobre o `xlsx` (já resolvido)

O `xlsx` do npm parou em `0.18.5` e nunca recebeu correção para a prototype
pollution (GHSA-4r6h-8v6p-xvw6) nem para a ReDoS (GHSA-5pgg-2g8v-p4x9). O
SheetJS migrou a distribuição para o CDN próprio, então o `package.json` aponta
para:

```
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

A API é a mesma (`XLSX.read` / `utils.sheet_to_json`) — nenhum dos 5 serviços de
importação mudou. **Consequência a saber:** o build passa a depender de
`cdn.sheetjs.com` estar no ar. Se um dia isso incomodar, a alternativa é
vendorizar o tarball no repositório ou migrar os parsers para o `exceljs`, que
já é dependência do projeto (usado no PC-Factory).
