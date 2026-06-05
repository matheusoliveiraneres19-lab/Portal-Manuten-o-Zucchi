import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

const GOLD = "#c49a45";
const CHAMPAGNE = "#f5e9d0";
const INK = "#070808";
const SERIF = "Georgia, 'Times New Roman', serif";

/* ------------------------------------------------------------------ */
/* Cena de tela (captura real) com Ken Burns + legenda lower-third    */
/* ------------------------------------------------------------------ */

type ScreenSceneProps = {
  src: string;
  durationInFrames: number;
  eyebrow: string;
  title: string;
  subtitle: string;
};

function ScreenScene({ src, durationInFrames, eyebrow, title, subtitle }: ScreenSceneProps) {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp"
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.14]);
  const captionY = interpolate(frame, [12, 38], [44, 0], { extrapolateRight: "clamp" });
  const captionOpacity = interpolate(frame, [12, 38], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: INK, opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>

      {/* Escurecimento inferior para legibilidade da legenda */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.22) 32%, transparent 58%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 84,
          bottom: 92,
          transform: `translateY(${captionY}px)`,
          opacity: captionOpacity
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 48, height: 2, backgroundColor: GOLD }} />
          <span
            style={{
              color: GOLD,
              letterSpacing: 6,
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase"
            }}
          >
            {eyebrow}
          </span>
        </div>
        <h2 style={{ fontFamily: SERIF, color: "#ffffff", fontSize: 66, margin: 0, lineHeight: 1.04 }}>
          {title}
        </h2>
        <p style={{ color: CHAMPAGNE, fontSize: 25, marginTop: 14, maxWidth: 1180 }}>{subtitle}</p>
      </div>

      {/* Moldura dourada sutil */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 0 1px rgba(196,154,69,0.18)" }} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* Cena de marca (abertura e encerramento)                            */
/* ------------------------------------------------------------------ */

type BrandSceneProps = {
  durationInFrames: number;
  title: string;
  subtitle: string;
  tagline?: string;
};

function BrandScene({ durationInFrames, title, subtitle, tagline }: BrandSceneProps) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp"
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const rise = interpolate(frame, [0, 32], [26, 0], { extrapolateRight: "clamp" });
  const glow = interpolate(frame, [0, 60], [0.05, 0.18], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{ backgroundColor: INK, opacity, alignItems: "center", justifyContent: "center" }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(196,154,69,${glow}), transparent 40%)`
        }}
      />
      <div style={{ textAlign: "center", transform: `translateY(${rise}px)` }}>
        <div
          style={{
            width: 96,
            height: 96,
            margin: "0 auto 28px",
            display: "grid",
            placeItems: "center",
            border: `1px solid ${GOLD}`,
            transform: "rotate(45deg)",
            boxShadow: "0 0 60px rgba(196,154,69,0.25)"
          }}
        >
          <span style={{ transform: "rotate(-45deg)", fontFamily: SERIF, fontSize: 46, color: GOLD }}>Z</span>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 88, color: GOLD, lineHeight: 1 }}>Zucchi</div>
        <div style={{ letterSpacing: 12, fontSize: 16, color: CHAMPAGNE, marginTop: 10, textTransform: "uppercase" }}>
          Stones Luxury
        </div>
        <h1 style={{ fontFamily: SERIF, color: "#ffffff", fontSize: 48, marginTop: 34, fontWeight: 400 }}>
          {title}
        </h1>
        <p style={{ color: "#a8a29e", fontSize: 23, marginTop: 12 }}>{subtitle}</p>
        {tagline ? (
          <p style={{ color: GOLD, fontSize: 21, marginTop: 28, fontStyle: "italic", fontFamily: SERIF }}>
            {tagline}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* Composição (45s @ 30fps = 1350 frames)                             */
/* ------------------------------------------------------------------ */

export function PortalDemo() {
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Sequence durationInFrames={110}>
        <BrandScene
          durationInFrames={110}
          title="Portal de Gestão da Manutenção"
          subtitle="Zucchi Stones Luxury"
        />
      </Sequence>

      <Sequence from={110} durationInFrames={250}>
        <ScreenScene
          src={staticFile("captures/login.png")}
          durationInFrames={250}
          eyebrow="Acesso"
          title="Acesso premium e seguro"
          subtitle="Autenticação com feedback elegante e transição fluida para o portal."
        />
      </Sequence>

      <Sequence from={360} durationInFrames={250}>
        <ScreenScene
          src={staticFile("captures/dashboard.png")}
          durationInFrames={250}
          eyebrow="Visão geral"
          title="Dashboard executivo"
          subtitle="Indicadores, gráficos e alertas da manutenção em um só lugar."
        />
      </Sequence>

      <Sequence from={610} durationInFrames={250}>
        <ScreenScene
          src={staticFile("captures/ordens.png")}
          durationInFrames={250}
          eyebrow="Operação"
          title="Ordens de Serviço"
          subtitle="Filtros avançados, multi-seleção e mais de 1.200 ordens do SAP/Fiori."
        />
      </Sequence>

      <Sequence from={860} durationInFrames={320}>
        <ScreenScene
          src={staticFile("captures/criticos.png")}
          durationInFrames={320}
          eyebrow="Análise"
          title="Equipamentos Críticos"
          subtitle="Score de criticidade por volume de OS, horas apontadas e ordens em aberto."
        />
      </Sequence>

      <Sequence from={1180} durationInFrames={170}>
        <BrandScene
          durationInFrames={170}
          title="Mais controle. Mais performance."
          subtitle="Portal de Gestão da Manutenção"
          tagline="Tradição, excelência e precisão em cada detalhe."
        />
      </Sequence>
    </AbsoluteFill>
  );
}
