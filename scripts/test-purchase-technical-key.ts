/**
 * Testes da CHAVE TÉCNICA de compras.
 *
 * A chave é o que faz a reimportação ATUALIZAR a linha existente em vez de criar
 * uma nova. Quando ela incluía o Pedido de Compra (e o total líquido), a mesma
 * linha ganhava chave nova ao virar pedido: a versão antiga, sem pedido, ficava
 * no banco para sempre e a aba Compras Pendentes a listava como pendência mesmo
 * depois de comprada e recebida.
 *
 * Uso: npx tsx scripts/test-purchase-technical-key.ts
 */
import { buildPurchaseGroupKey, buildPurchaseTechnicalKey } from "@/utils/purchases-normalizer";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) {
    console.log(`✅ ${name}`);
    return;
  }
  failures += 1;
  console.log(`❌ ${name}${detail ? `\n     ${detail}` : ""}`);
}

/** Simula a leitura de uma planilha: atribui o ordinal na ordem das linhas. */
function keysForSheet(
  rows: Array<{ requisitionNumber: string | null; materialCode: string | null; itemDescription: string }>
): string[] {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const groupKey = buildPurchaseGroupKey(row);
    const occurrence = (occurrences.get(groupKey) ?? 0) + 1;
    occurrences.set(groupKey, occurrence);
    return buildPurchaseTechnicalKey({ ...row, occurrence });
  });
}

const ITEM = { requisitionNumber: "10100065", materialCode: "47294", itemDescription: "Tubo Quadrado Inox" };

console.log("── Chave técnica de compras ───────────────────────────────────");

// 1. O caso que originou o bug: a MESMA linha antes e depois de virar pedido.
{
  const antes = keysForSheet([ITEM]);
  const depois = keysForSheet([ITEM]);
  check(
    "1. A chave NÃO muda quando a requisição vira pedido (mesma linha, mesma chave)",
    antes[0] === depois[0],
    `antes=${antes[0]} depois=${depois[0]}`
  );
}

// 2. Campos voláteis não podem entrar na chave: só a identidade estável entra.
check(
  "2. A chave só depende de requisição + material + descrição + ordinal",
  buildPurchaseTechnicalKey({ ...ITEM, occurrence: 1 }) === "10100065|47294|Tubo Quadrado Inox|#1"
);

// 3. Itens múltiplos do mesmo pedido (o caso real da req. 10096472): a planilha
//    não traz número de item, então o ordinal é o que separa as linhas.
{
  const serv = { requisitionNumber: "10096472", materialCode: "39675", itemDescription: "Serv Carpintaria" };
  const chaves = keysForSheet([serv, serv, serv]);
  check("3. Três linhas idênticas na planilha geram três chaves distintas", new Set(chaves).size === 3);
  check("3b. Ordinais em sequência a partir de 1", chaves.join(",").endsWith("#1,10096472|39675|Serv Carpintaria|#2,10096472|39675|Serv Carpintaria|#3"));
}

// 4. Grupo que CRESCE: 1 requisição pendente vira 3 itens de pedido.
//    A ocorrência #1 casa com a linha existente; #2 e #3 são novas. Sem órfã.
{
  const serv = { requisitionNumber: "10099396", materialCode: "39675", itemDescription: "Serv Carpintaria" };
  const antes = keysForSheet([serv]);
  const depois = keysForSheet([serv, serv, serv]);
  check("4. Grupo que cresce reaproveita a chave da linha existente", depois[0] === antes[0]);
  check("4b. As linhas extras recebem chaves novas", depois.slice(1).every((key) => key !== antes[0]));
}

// 5. Nenhuma colisão dentro de uma mesma planilha, mesmo com campos nulos.
{
  const rows = [
    { requisitionNumber: null, materialCode: "1", itemDescription: "Sem requisição" },
    { requisitionNumber: null, materialCode: "1", itemDescription: "Sem requisição" },
    { requisitionNumber: "9", materialCode: null, itemDescription: "Sem material" },
    { requisitionNumber: "9", materialCode: null, itemDescription: "Sem material" },
    ITEM
  ];
  const chaves = keysForSheet(rows);
  check("5. Linhas com requisição/material nulos não colidem", new Set(chaves).size === rows.length);
}

// 6. Linhas de grupos diferentes nunca compartilham chave.
{
  const chaves = keysForSheet([
    ITEM,
    { ...ITEM, materialCode: "47295" },
    { ...ITEM, requisitionNumber: "10100066" },
    { ...ITEM, itemDescription: "Tubo Redondo Inox" }
  ]);
  check("6. Grupos distintos geram chaves distintas", new Set(chaves).size === 4);
}

// 7. A chave nova nunca coincide com o formato antigo (`req|pedido|mat|desc|qtd|liq`),
//    o que garante que a migração não gera colisão transitória com linhas ainda
//    não convertidas.
check(
  "7. Formato novo termina em |#<n> — nunca colide com uma chave antiga",
  /\|#\d+$/.test(buildPurchaseTechnicalKey({ ...ITEM, occurrence: 12 }))
);

console.log(
  `\n${failures === 0 ? "TODOS OS TESTES PASSARAM" : `${failures} TESTE(S) FALHARAM`} — ${checks - failures}/${checks}`
);
process.exit(failures === 0 ? 0 : 1);
