"use client";

import { useEffect } from "react";

/**
 * Boundary de último recurso: cobre falhas no layout raiz ou stream interrompido
 * (ex.: função serverless cortada no meio do RSC). Substitui <html>/<body>, então
 * usa estilos inline (o CSS global do layout pode não estar carregado aqui).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("[GlobalError]", error);
    }
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(circle at 50% 35%, #14161a 0%, #050505 60%)",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#e8dcc0",
          padding: "24px"
        }}
      >
        <div
          style={{
            maxWidth: "440px",
            width: "100%",
            textAlign: "center",
            border: "1px solid rgba(196,154,69,0.30)",
            borderRadius: "14px",
            background: "#0a0b0b",
            padding: "40px 28px",
            boxShadow: "0 24px 70px rgba(0,0,0,0.6)"
          }}
        >
          <div
            style={{
              margin: "0 auto 20px",
              width: "64px",
              height: "64px",
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              border: "1px solid rgba(196,154,69,0.4)",
              color: "#c49a45",
              fontSize: "30px"
            }}
          >
            ⚠
          </div>
          <h1 style={{ fontSize: "24px", margin: "0 0 8px", color: "#fff" }}>Algo saiu do esperado</h1>
          <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#a1a1aa", margin: "0 0 24px" }}>
            Não foi possível carregar este módulo no momento. Tente atualizar a página ou revise os filtros aplicados.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                height: "44px",
                padding: "0 20px",
                borderRadius: "10px",
                border: "1px solid rgba(196,154,69,0.55)",
                background: "rgba(196,154,69,0.15)",
                color: "#c49a45",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                fontFamily: "inherit"
              }}
            >
              Tentar novamente
            </button>
            <a
              href="/"
              style={{
                height: "44px",
                padding: "0 20px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "10px",
                border: "1px solid rgba(196,154,69,0.2)",
                color: "#d4d4d8",
                fontWeight: 600,
                fontSize: "14px",
                textDecoration: "none"
              }}
            >
              Voltar ao dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
