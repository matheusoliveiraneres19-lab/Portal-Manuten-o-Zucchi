/**
 * Migração idempotente de senhas para bcrypt.
 *
 * Percorre todos os usuários e, para os que ainda têm a senha em texto puro,
 * grava o hash bcrypt equivalente. NÃO é destrutivo: só atualiza `passwordHash`.
 * Rodar quantas vezes quiser — quem já está em bcrypt é pulado.
 *
 * Uso:  npm run auth:hash-passwords
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword, isBcryptHash } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, login: true, passwordHash: true }
  });

  let migrated = 0;
  let alreadyBcrypt = 0;
  let withoutPassword = 0;

  for (const user of users) {
    if (!user.passwordHash) {
      withoutPassword += 1;
      continue;
    }
    if (isBcryptHash(user.passwordHash)) {
      alreadyBcrypt += 1;
      continue;
    }

    const hashed = await hashPassword(user.passwordHash);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed }
    });
    migrated += 1;
    console.log(`  ✓ migrado: ${user.login}`);
  }

  console.log("\nResumo da migração de senhas:");
  console.log(`- Total de usuários:   ${users.length}`);
  console.log(`- Migrados p/ bcrypt:  ${migrated}`);
  console.log(`- Já em bcrypt:        ${alreadyBcrypt}`);
  console.log(`- Sem senha:           ${withoutPassword}`);
}

main()
  .catch((error) => {
    console.error("Falha na migração de senhas:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
