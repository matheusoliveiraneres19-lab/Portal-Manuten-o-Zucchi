const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Seed temporario: sera preenchido apos a criacao do schema completo.
  console.log("Seed ainda nao configurado: schema inicial sem modelos.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
