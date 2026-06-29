import { redirect } from "next/navigation";

// A antiga aba "Relatórios" foi substituída por "Preventivas Programadas" (jun/2026).
// Mantemos este redirect permanente para não quebrar bookmarks/links antigos.
export default function RelatoriosLegacyRedirect() {
  redirect("/dashboard/preventivas-programadas");
}
