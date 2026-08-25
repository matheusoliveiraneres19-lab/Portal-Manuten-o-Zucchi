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
 */

/**
 * Cabeçalhos de segurança aplicados a TODAS as rotas.
 *
 * O portal é um app de sessão por cookie, então o alvo principal aqui é
 * clickjacking: sem `X-Frame-Options`, qualquer página externa podia embutir o
 * dashboard num iframe invisível e colher cliques de um usuário já autenticado.
 *
 * `DENY` é seguro porque nada do portal é feito para ser embutido — os vídeos de
 * procedimento são o portal ENQUADRANDO o YouTube, o que este cabeçalho não
 * afeta (ele só governa quem pode enquadrar o portal).
 *
 * NÃO há Content-Security-Policy aqui de propósito: o Next injeta scripts e
 * estilos inline no App Router, então uma CSP precisa de nonce por requisição e
 * um erro derruba a renderização inteira. Fica como trabalho separado, com
 * validação página por página — o `frame-ancestors` que ela traria já está
 * coberto pelo X-Frame-Options acima.
 */
const securityHeaders = [
  // Ninguém enquadra o portal em iframe/frame/object.
  { key: "X-Frame-Options", value: "DENY" },
  // Impede o browser de "adivinhar" outro Content-Type que o declarado, o que
  // transformaria um anexo enviado por usuário em script executável.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Não vaza o caminho interno (ex.: /dashboard/equipe/<id>) para terceiros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // O portal não usa câmera, microfone nem geolocalização.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Remove o "X-Powered-By: Next.js", que só serve para informar a versão do
  // framework a quem procura um alvo.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
