/**
 * Fixtures CONTROLADAS da importação MRP (FASE C), geradas em memória com a
 * SheetJS do Portal. Imitam os layouts do SAP: título de relatório antes do
 * cabeçalho, colunas com acento, datas como serial formatado, códigos com
 * zeros à esquerda, depósitos "1400"/"01400", números "1.500"/"2,5"/"-0".
 *
 * Não substituem os arquivos reais (MB52 e compras) — esses ainda estão pendentes.
 */
import * as XLSX from "xlsx";

export type FixtureFile = { name: string; data: Buffer };
type Sheets = Record<string, unknown[][]>;

/** Serial do Excel para uma data (com fração = hora). */
export function serial(y: number, m: number, d: number, hours = 0): number {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 + hours / 24;
}

const DATE_MARK = Symbol("date");
/** Célula numérica com formato de data (como o SAP exporta). */
export function dateCell(value: number): unknown {
  return { [DATE_MARK]: true, value };
}

export function workbook(name: string, sheets: Sheets, bookType: XLSX.BookType = "xlsx"): FixtureFile {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const marks: [number, number][] = [];
    const plain = rows.map((row, r) =>
      row.map((cell, c) => {
        if (cell && typeof cell === "object" && DATE_MARK in (cell as object)) {
          marks.push([r, c]);
          return (cell as { value: number }).value;
        }
        return cell;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet(plain);
    for (const [r, c] of marks) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        cell.t = "n";
        cell.z = "dd/mm/yyyy";
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return { name, data: XLSX.write(wb, { type: "buffer", bookType }) as Buffer };
}

export function csv(name: string, text: string): FixtureFile {
  return { name, data: Buffer.from(text, "utf8") };
}

/* -------------------------------------------------------------------------- */

export const BASE_HEADERS = ["Material", "Texto breve material", "Grupo de mercadorias", "UM básica", "Minimo", "Maximo", "Status MRP"];

export function baseFixture(): FixtureFile {
  return workbook("Controle_MRP_teste.xlsx", {
    "MRP Analise manutenção": [
      ["CONTROLE MRP - MANUTENÇÃO"],
      [],
      BASE_HEADERS,
      ["13515", "Modulo Beckhoff", "Y0035", "PEC", 0, 0, "Sem saída no período"],
      [13439, "Motor Breton 1885-0125", "Y0051", "PEC", 2, 4, "satelite breton 8"],
      ["000013515", "Mesmo código com zeros", "Y0035", "PEC", 1, 1, "Ok"],
      ["13516.0", "Código com .0", "Y0035", "PEC", "1.500", "2,5", "Satélite Simec 6"],
      ["", "Linha sem código", "Y0035", "PEC", 1, 1, "Ok"],
      ["20001", "Coroa diamantada", "Y0040", "PEC", 1, 2, "Coroa Cemar"],
      ["20002", "Primeira ocorrência mín>0", "Y0040", "PEC", 3, 6, "Ok"]
    ],
    "MRP Analise Eletrica": [
      [...BASE_HEADERS.slice(0, 4), "Utilização livre", "Minimo", "Maximo", "Status MRP"],
      ["2981", "Abracadeira Nylon", "Y0044", "PEC", 1303, 500, 1000, "Ok"],
      // Duplicado de 13515 (1ª tem mín=máx=0 e sem conjunto): substitui mín/máx
      // e completa o conjunto, mas NÃO a descrição.
      ["13515", "Descrição do duplicado", "Y0099", "UN", 0, 5, 10, "Satelite Breton 6"],
      // Duplicado de 20002 (1ª tem mín 3): nada muda.
      ["20002", "Duplicado ignorado", "Y0040", "PEC", 0, 9, 9, "Satelite Simec"]
    ],
    "MRP Automatico Gyan": [
      ["USO GERAL"],
      ["Material", "Texto breve material", "Local de utilização", "Tipo", "Estoque mínimo", "Estoque máximo"],
      ["4946", "Sabao Desengraxante", "Fábrica em Geral", "geral", 20, 50]
    ],
    "Lubrificação extra": [
      ["Material", "Descrição", "Estoque mínimo", "Estoque máximo", "Status MRP"],
      ["30001", "Graxa", 1, 3, "Satélites Breton"]
    ],
    Notas: [["Observação"], ["Sem colunas de MRP aqui"]]
  });
}

export const STOCK_ROWS: unknown[][] = [
  ["MB52 - Estoque por material"],
  ["Centro 1000"],
  ["Material", "Texto breve material", "Centro", "Depósito", "Utilização livre", "Unidade"],
  ["13515", "Modulo", "1000", "1400", "1.500", "PEC"],
  ["13439", "Motor", "1000", "01400", "2,5", "PEC"],
  ["13439", "Motor (dup)", "1000", "1400", 99, "PEC"],
  ["2981", "Abracadeira", "1000", "1500", 7, "PEC"],
  ["2981", "Abracadeira 1400", "1000", "1400", "-0", "PEC"],
  ["", "Sem código", "1000", "1400", 3, "PEC"],
  ["000013515", "Zeros à esquerda", "1000", "1400", 4, "PEC"],
  ["20001", "Coroa", "1000", "1500", 1, "PEC"]
];

export function stockFixture(): FixtureFile {
  return workbook("MB52_teste.xlsx", { Sheet1: STOCK_ROWS });
}

/** Mesmo estoque, sem a coluna Depósito. */
export function stockNoDepositFixture(): FixtureFile {
  const rows = STOCK_ROWS.map((r, i) => (i < 2 ? r : r.filter((_, c) => c !== 3)));
  return workbook("MB52_sem_deposito.xlsx", { Plan1: rows });
}

export const PURCHASE_HEADERS = [
  "Material",
  "Texto breve do pedido",
  "Quantidade",
  "Data da requisição",
  "Requisição de compra",
  "Pedido de compra",
  "Data recebimento",
  "Previsão de entrega",
  "Fornecedor"
];

export function purchaseFixture(): FixtureFile {
  return workbook("Compras_teste.xlsx", {
    Compras: [
      ["Relatório de compras realizadas"],
      PURCHASE_HEADERS,
      // 13515: 3 compras — a última (maior cmpOrdem) é a de 2026-09-10, pendente.
      ["13515", "Modulo", 5, dateCell(serial(2026, 8, 1)), "1000001", "4500000001", dateCell(serial(2026, 8, 20)), "", "Fornecedor A"],
      ["13515", "Modulo", 3, dateCell(serial(2026, 9, 10)), "1000005", "", "", dateCell(serial(2026, 9, 30)), "Fornecedor B"],
      ["13515", "Modulo", 2, "05/09/2026", "1000004", "4500000009", "", "", "Fornecedor C"],
      // 13439: mesma data, desempate por pedido (texto com zeros à esquerda).
      ["13439", "Motor", 1, "2026-09-02", "", "4500000010", "", "", "Fornecedor D"],
      ["13439", "Motor", 1, "2026-09-02", "", "4500000002", "2026-09-05", "", "Fornecedor D"],
      // 2981: sem data nenhuma ("0000-00-00") e sem pedido/requisição.
      [2981, "Abracadeira", "1.000", "", "", "", "", "", ""],
      // data só no recebimento (cai no 2º termo do cmpOrdem).
      ["20001", "Coroa", 1, "", "1000009", "", dateCell(serial(2026, 7, 15, 18)), "", "Fornecedor E"],
      ["", "Sem código", 1, "2026-09-01", "1", "", "", "", ""],
      ["20002", "Hora tarde", 4, dateCell(serial(2026, 9, 3, 23.99)), "1000010", "", "", "", "Fornecedor F"]
    ]
  });
}

/** Só Material e descrição — o HTML aceita. */
export function purchaseMinimalFixture(): FixtureFile {
  return workbook("Compras_minimo.xlsx", {
    Plan1: [
      ["Material", "Texto breve material"],
      ["13515", "Modulo"],
      ["13515", "Modulo de novo"]
    ]
  });
}

/** Sem "Data da requisição": o alias genérico `data` cai em "Data recebimento". */
export function purchaseOnlyReceiptDateFixture(): FixtureFile {
  return workbook("Compras_so_recebimento.xlsx", {
    Plan1: [
      ["Material", "Requisição", "Data recebimento", "Fornecedor"],
      ["13515", "1000001", "10/09/2026", "Fornecedor A"]
    ]
  });
}

export function purchaseCsvFixture(): FixtureFile {
  return csv(
    "compras.csv",
    [
      "Material,Quantidade,Data da requisição,Requisição,Pedido,Data recebimento,Fornecedor",
      "13515,5,01/09/2026,1000001,4500000001,,Fornecedor A",
      "13439,\"1.500\",2026-09-02,1000002,,10/09/2026,Fornecedor B",
      "2981,2,09/13/2026,,,,"
    ].join("\n")
  );
}

export function unknownFixture(): FixtureFile {
  return workbook("planilha_qualquer.xlsx", { Dados: [["Foo", "Bar"], [1, 2], [3, 4]] });
}

/** Duas abas: a detecção escolhe "Estoque" (maior score); o usuário pode trocar. */
export function twoSheetStockFixture(): FixtureFile {
  return workbook(
    "Estoque_duas_abas.xls",
    {
      Resumo: [["Material", "Livre"], ["13515", 1]],
      Estoque: STOCK_ROWS.slice(2)
    },
    "biff8"
  );
}
