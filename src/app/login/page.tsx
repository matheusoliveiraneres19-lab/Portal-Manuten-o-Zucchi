import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/login/LoginPage";
import { AUTH_COOKIE_NAME, isMockSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Portal de Gestão da Manutenção V.01",
  description: "Acesso ao Portal de Gestão da Manutenção Zucchi."
};

export default function Page() {
  if (isMockSession(cookies().get(AUTH_COOKIE_NAME)?.value)) {
    redirect("/");
  }

  return <LoginPage />;
}
