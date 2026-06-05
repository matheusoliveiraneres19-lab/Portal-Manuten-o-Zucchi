import type { Metadata } from "next";
import { Toaster } from "sonner";
import { MotionProvider } from "@/components/MotionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal de Gestão da Manutenção V.01",
  description: "Fase 1 visual do portal de gestão da manutenção Zucchi."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <MotionProvider>{children}</MotionProvider>
        <Toaster
          position="top-right"
          theme="dark"
          closeButton
          toastOptions={{
            style: {
              background: "#0a0b0b",
              border: "1px solid rgba(196,154,69,0.35)",
              color: "#f5e9d0",
              boxShadow: "0 18px 44px rgba(0,0,0,0.55)"
            }
          }}
        />
      </body>
    </html>
  );
}

