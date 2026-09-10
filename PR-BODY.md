Checkup geral do portal: verificação estática, testes, build, runtime e auditoria contra o banco. Corrige tudo o que foi encontrado, exceto o upgrade do Next — adiado por decisão de escopo e documentado.

## Prioridade alta

**Histórico de migrations reconciliado.** O `_prisma_migrations` tinha 1 de 16 registros. O schema batia 100% com o banco (`migrate diff` vazio), então era só bookkeeping — mas `prisma migrate deploy` ia tentar recriar tabelas existentes e falhar, e `migrate dev` ia propor reset de um banco com 80 mil linhas. Resolvido com `migrate resolve --applied` nas 15 faltantes. **Já aplicado no banco**, não vem neste diff.

**Senha temporária vencida bloqueada.** `temporaryPasswordExpiresAt` era gravado em três lugares e nunca lido — o prazo de 7 dias não valia nada. Havia um caso ativo (vencido em 21/08).

**Upgrade do Next adiado.** 21 advisories no 14.2.35. Exige major + React 19. Plano completo em `docs/upgrade-next-react.md`.

## Prioridade média

**Compras Realizadas ligada de ponta a ponta.** O backend já entregava a análise N1..N4 e o recorte `retrato=atual`, mas a página não renderizava nada disso e não havia controle para acionar o recorte. Também corrige o `removeChip` local, que gravava `""` num campo booleano.

**Rate limiting no login** (não havia nenhum), **headers de segurança** (não havia nenhum) e **`xlsx` corrigido** via tarball oficial do SheetJS — o npm parou na 0.18.5 e nunca corrigiu a prototype pollution nem a ReDoS.

## Prioridade baixa

`change-password` restrito ao primeiro acesso; guard de sessão em 10 rotas de leitura; `.env.example` completo.

## Verificação

`tsc` limpo · `eslint` sem warnings · build de produção OK · **58/58 testes** · headers, 401s e o 429 confirmados em servidor rodando · `npm audit` de 19 para 8 vulnerabilidades (16 → 6 altas).

Na aba Compras Realizadas, medido contra o banco real: 1.361 linhas no histórico completo, 1.327 no retrato atual.

## Antes do merge

- O `woliviera` precisa de reset pelo admin — a senha temporária dele venceu e agora é recusada, que é o comportamento pretendido.
- O rate limiting é contador em memória: na Vercel o teto vale por instância serverless. Corta rajada, não é SLA.
- A análise N1..N4 aparece como "base sem classificação" porque as colunas estão vazias nos 3.353 registros. O importador já lê os cabeçalhos; falta a planilha trazê-los.
- O build passa a depender de `cdn.sheetjs.com` estar no ar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
