/**
 * Diretório de build do Next, configurável por NEXT_DIST_DIR (padrão `.next`).
 *
 * IMPORTANTE — o valor DEVE ser um caminho relativo DENTRO do projeto.
 * O Next concatena `distDir` com a raiz do projeto (caminho absoluto vira
 * `<raiz>\C:\...` e falha no mkdir), e um caminho que "sobe" para fora da árvore
 * quebra de duas formas já comprovadas:
 *   1. os chunks gerados não resolvem `node_modules` → "Collecting page data"
 *      falha com `Cannot find module 'react/jsx-runtime'`;
 *   2. os route types gerados não resolvem `next/server.js` → erro de tipo.
 * NODE_PATH não resolve nenhum dos dois casos.
 *
 * Pelo mesmo motivo, NÃO transforme `.next` em junction/symlink apontando para
 * fora do projeto (ex.: para escapar do sync do OneDrive): o Node resolve o
 * caminho REAL do link e perde o `node_modules`, travando `next build` e
 * `next dev`. Para tirar o build do OneDrive, mova o projeto inteiro para fora
 * dele — não só a pasta de saída.
 *
 * Use NEXT_DIST_DIR apenas para builds paralelos dentro do projeto
 * (ex.: NEXT_DIST_DIR=.next-verify, já coberto pelo .gitignore).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next"
};

export default nextConfig;
