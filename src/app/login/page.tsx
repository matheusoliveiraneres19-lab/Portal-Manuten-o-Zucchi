import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/login/LoginPage";
import { AUTH_COOKIE_NAME, getAuthSecret } from "@/lib/auth";
import { verifySession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Portal de Gestão da Manutenção V.01",
  description: "Acesso ao Portal de Gestão da Manutenção Zucchi."
};

export default async function Page() {
  const secret = getAuthSecret();
  if (secret) {
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    const session = await verifySession(token, secret);
    if (session) {
      redirect("/");
    }
  }

  return <LoginPage />;
}
