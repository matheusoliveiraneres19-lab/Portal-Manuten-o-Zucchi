/**
 * Cria (ou atualiza) um usuário com SENHA TEMPORÁRIA e força a troca no 1º acesso.
 *
 * A senha é gravada SOMENTE como hash bcrypt (nunca em texto puro) e o usuário
 * recebe mustChangePassword = true — então é obrigado a redefinir a senha antes
 * de acessar o portal.
 *
 * Uso:
 *   npx tsx scripts/create-temp-user.ts <login> "<Nome>" <senhaTemporaria> [ROLE] [email]
 * Ex.:
 *   npx tsx scripts/create-temp-user.ts joao.tecnico "João Técnico" Temp@1234 TECNICO joao@zucchi.local
 *
 * ROLE: ADMIN | GESTOR | TECNICO | COMPRAS | VISUALIZADOR (padrão: TECNICO).
 */
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const [login, name, tempPassword, roleArg, email] = process.argv.slice(2);

  if (!login || !name || !tempPassword) {
    console.error('Uso: npx tsx scripts/create-temp-user.ts <login> "<Nome>" <senhaTemporaria> [ROLE] [email]');
    process.exit(1);
  }
  if (tempPassword.length < 8) {
    console.error("A senha temporária deve ter no mínimo 8 caracteres.");
    process.exit(1);
  }

  const role = (roleArg && (Role as Record<string, Role>)[roleArg]) || Role.TECNICO;
  const passwordHash = await hashPassword(tempPassword);
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // expira em 7 dias

  const user = await prisma.user.upsert({
    where: { login: login.toLowerCase() },
    update: {
      name,
      email: email || undefined,
      passwordHash,
      role,
      status: UserStatus.ATIVO,
      mustChangePassword: true,
      temporaryPasswordCreatedAt: now,
      temporaryPasswordExpiresAt: expires
    },
    create: {
      login: login.toLowerCase(),
      name,
      email: email || undefined,
      passwordHash,
      role,
      status: UserStatus.ATIVO,
      mustChangePassword: true,
      temporaryPasswordCreatedAt: now,
      temporaryPasswordExpiresAt: expires
    },
    select: { id: true, login: true, name: true, role: true, mustChangePassword: true }
  });

  console.log("Usuário com senha temporária pronto (troca obrigatória no 1º acesso):");
  console.log(`- login: ${user.login}`);
  console.log(`- nome: ${user.name}`);
  console.log(`- papel: ${user.role}`);
  console.log(`- mustChangePassword: ${user.mustChangePassword}`);
  console.log("A senha temporária NÃO é exibida nem registrada — entregue-a ao usuário por canal seguro.");
}

main()
  .catch((error) => {
    console.error("Falha ao criar usuário temporário:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
