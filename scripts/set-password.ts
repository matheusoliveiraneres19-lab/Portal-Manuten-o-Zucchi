/**
 * Define (ou redefine) a senha de um usuário, gravando o hash bcrypt.
 * NÃO é destrutivo além de atualizar o `passwordHash` do usuário-alvo.
 *
 * Uso:  tsx scripts/set-password.ts <login> <novaSenha>
 *   ex: npm run auth:set-password -- admin NovaSenhaForte123
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const MIN_LENGTH = 8;

async function main() {
  const [, , loginArg, passwordArg] = process.argv;
  const login = String(loginArg ?? "").trim().toLowerCase();
  const password = String(passwordArg ?? "");

  if (!login || !passwordArg) {
    console.error("Uso: tsx scripts/set-password.ts <login> <novaSenha>");
    process.exit(1);
  }

  if (password.length < MIN_LENGTH) {
    console.error(`A senha deve ter pelo menos ${MIN_LENGTH} caracteres.`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true } });
  if (!user) {
    console.error(`Usuário com login "${login}" não encontrado.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) }
  });

  console.log(`✓ Senha atualizada (bcrypt) para o usuário "${user.login}".`);
}

main()
  .catch((error) => {
    console.error("Falha ao definir a senha:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
