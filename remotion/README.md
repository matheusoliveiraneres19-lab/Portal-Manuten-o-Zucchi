# Vídeo demo do Portal (Remotion + capturas reais)

Vídeo institucional/demo (~45s, 1920×1080, 30fps) montado com **Remotion**
a partir de **capturas reais** do portal. Reproduzível: quando o portal
evoluir, basta recapturar e re-renderizar.

## Pipeline (3 passos)

1. **Suba o portal** (em outro terminal):
   ```bash
   npm run dev
   ```
2. **Capture as telas reais** (login, dashboard, ordens, equipamentos críticos):
   ```bash
   npm run capture
   ```
   Gera PNGs em `public/captures/` (Playwright, 1920×1080 @2x, com sessão).
3. **Renderize o vídeo**:
   ```bash
   npm run video:render      # gera out/portal-demo.mp4
   ```

## Edição visual ao vivo

```bash
npm run video                # abre o Remotion Studio (preview + timeline)
```

## Estrutura

- `remotion/index.ts` — registra a raiz do Remotion.
- `remotion/Root.tsx` — composição `PortalDemo` (1350 frames @ 30fps).
- `remotion/Demo.tsx` — cenas: abertura de marca → login → dashboard →
  ordens de serviço → equipamentos críticos → encerramento. Ken Burns,
  legendas lower-third e tema preto/grafite/dourado/champagne.
- `remotion.config.ts` — config de render.

## Observações

- `public/captures/` e `out/` são **regeneráveis** e ficam fora do Git.
- Para trilha sonora/locução: adicionar `<Audio/>` do Remotion em `Demo.tsx`.
- O Remotion é isolado do build do Next (`remotion`/`out` excluídos do tsconfig).
