/**
 * Prisma de TESTE que conta as consultas SQL. Importar depois de ./script-db e
 * ANTES de qualquer módulo de src/: o singleton de src/lib/prisma reaproveita
 * `globalThis.prisma`, então os services passam a usar este client.
 */
import { PrismaClient } from "@prisma/client";

let count = 0;
const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
client.$on("query", () => {
  count++;
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

export const queryCounter = {
  reset() {
    count = 0;
  },
  get value() {
    return count;
  }
};
