import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-guard";
import { listUsers, type AdminUserRow } from "@/services/users.service";
import { UsersAdminPage } from "@/components/users/UsersAdminPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Defesa em profundidade: além do middleware, a página só abre para ADMIN.
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "ADMIN") {
    redirect("/dashboard");
  }

  let users: AdminUserRow[] = [];
  try {
    users = await listUsers();
  } catch {
    users = [];
  }

  return <UsersAdminPage users={users} currentLogin={session.sub} />;
}
