/**
 * Validação do Relatório de Aderência contra a BASE REAL.
 *
 *   npm run test:adherence            # recorte padrão 01/01/2026 → 31/08/2026
 *   npm run test:adherence 2026-06-24 2026-08-31
 *
 * Confere as invariantes que o relatório não pode violar (soma das áreas = total,
 * fechadas + pendentes = total, nada de NaN/Infinity/percentual > 100, colaborador
 * dentro da própria área, "SEM RESPONSÁVEL" fora do ranking) e cruza o resultado
 * com uma contagem INDEPENDENTE feita direto no banco — se o service e a
 * contagem crua divergirem, o teste falha.
 *
 * Também gera o PDF em `scripts/out/` para inspeção visual.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { buildAdherenceReportDataset } from "../src/services/service-order-adherence-report.service";
import { GLYPH_FALLBACK, renderAdherenceReportPdf } from "../src/lib/pdf/adherence-report.pdf";
import { excludeInvalidTestEquipmentWhere } from "../src/utils/service-order-classification";
import { toEndOfDay, toStartOfDay } from "../src/utils/date-range";

const DATE_FROM = process.argv[2] ?? "2026-01-01";
const DATE_TO = process.argv[3] ?? "2026-08-31";

/** Números publicados no PDF de referência (AGOSTO/2026), só como marco histórico. */
const REFERENCE_AUGUST = {
  MECANICA: { total: 183, fechadas: 164 },
  ELETRICA: { total: 343, fechadas: 301 },
  TERCEIROS: { total: 52, fechadas: 13 },
  TOTAL: { total: 578, fechadas: 478 }
};

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Contagem INDEPENDENTE do service: lê o banco e deduplica por número de OS. */
async function independentCount(from: string, to: string) {
  const rows = await prisma.serviceOrder.findMany({
    where: {
      ...excludeInvalidTestEquipmentWhere(),
      openedAt: { gte: toStartOfDay(from), lte: toEndOfDay(to) }
    },
    select: { osNumber: true, status: true, planningGroup: true }
  });

  const byOrder = new Map<string, { area: string | null; closed: boolean }>();
  for (const row of rows) {
    const group = (row.planningGroup ?? "").toLowerCase();
    const area = group.includes("mecanic")
      ? "MECANICA"
      : group.includes("eletric")
        ? "ELETRICA"
        : group.includes("terceir")
          ? "TERCEIROS"
          : null;
    const existing = byOrder.get(row.osNumber);
    const closed = row.status === "FECHADA";
    if (!existing) byOrder.set(row.osNumber, { area, closed });
    else if (!closed) existing.closed = false;
  }

  const acc: Record<string, { total: number; fechadas: number }> = {};
  for (const order of Array.from(byOrder.values())) {
    if (!order.area) continue;
    const entry = (acc[order.area] ??= { total: 0, fechadas: 0 });
    entry.total += 1;
    if (order.closed) entry.fechadas += 1;
  }
  return acc;
}

async function main() {
  console.log(`\n=== RELATÓRIO DE ADERÊNCIA — validação ${DATE_FROM} → ${DATE_TO} ===\n`);

  const dataset = await buildAdherenceReportDataset({
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    useCurrentFilters: false
  });

  // ---- 1. Números do recorte ---------------------------------------
  console.log(`Período: ${dataset.periodo.label}  |  título: "${dataset.periodo.titleLabel}"`);
  console.log(`Arquivo: ${dataset.fileName}\n`);
  console.log("ADERÊNCIA GERAL");
  console.log(
    `  total=${dataset.geral.total}  fechadas=${dataset.geral.fechadas}  abertas=${dataset.geral.abertas}  aderência=${dataset.geral.aderencia}%\n`
  );
  console.log("POR ÁREA");
  for (const area of dataset.porArea) {
    console.log(
      `  ${area.label.padEnd(10)} total=${String(area.total).padStart(5)}  fechadas=${String(area.fechadas).padStart(5)}  pendentes=${String(area.abertas).padStart(4)}  aderência=${area.aderencia}%`
    );
  }

  console.log("\nQUALIDADE DOS DADOS");
  console.log(`  OS consideradas .............. ${dataset.qualidade.consideradas}`);
  console.log(`  OS sem responsável ........... ${dataset.qualidade.semResponsavel}`);
  console.log(`  OS sem grupo de planejamento . ${dataset.qualidade.semGrupoPlanejamento}`);
  console.log(`  OS sem data-base ............. ${dataset.qualidade.semDataBase}`);
  console.log(`  OS fora das 3 áreas .......... ${dataset.qualidade.foraDasAreas}`);
  console.log(`  linhas de operação lidas ..... ${dataset.qualidade.linhasOperacao}`);

  // ---- 2. Invariantes ----------------------------------------------
  console.log("\nINVARIANTES");

  check(
    "5/6. Soma das áreas = total geral",
    dataset.porArea.reduce((sum, area) => sum + area.total, 0) === dataset.geral.total,
    `${dataset.porArea.reduce((s, a) => s + a.total, 0)} ≠ ${dataset.geral.total}`
  );
  check(
    "Soma das fechadas por área = fechadas geral",
    dataset.porArea.reduce((sum, area) => sum + area.fechadas, 0) === dataset.geral.fechadas
  );
  check("10. fechadas + pendentes = total (geral)", dataset.geral.fechadas + dataset.geral.abertas === dataset.geral.total);
  check(
    "10. fechadas + pendentes = total (todas as áreas)",
    dataset.porArea.every((area) => area.fechadas + area.abertas === area.total)
  );

  const allTotals = [
    dataset.geral,
    ...dataset.porArea,
    ...dataset.porMes.flatMap((month) => [month.geral, ...Object.values(month.porArea)])
  ];
  check("15. Nenhum NaN", allTotals.every((t) => t.aderencia === null || Number.isFinite(t.aderencia)));
  check("16. Nenhum Infinity", allTotals.every((t) => t.aderencia === null || Number.isFinite(t.aderencia)));
  check("17. Nenhuma aderência > 100%", allTotals.every((t) => t.aderencia === null || t.aderencia <= 100));
  check("Nenhuma aderência < 0%", allTotals.every((t) => t.aderencia === null || t.aderencia >= 0));
  check(
    "Recorte vazio devolve null (nunca 0%)",
    allTotals.every((t) => (t.total === 0 ? t.aderencia === null : t.aderencia !== null))
  );

  // Soma dos meses tem de reconstituir o total (nenhuma OS sumiu no agrupamento).
  const mesesTotal = dataset.porMes.reduce((sum, month) => sum + month.geral.total, 0);
  check("3. Soma dos meses = total geral", mesesTotal === dataset.geral.total, `${mesesTotal} ≠ ${dataset.geral.total}`);
  check(
    "Meses do gráfico cobrem exatamente o período",
    dataset.porMes[0]?.monthKey === DATE_FROM.slice(0, 7) &&
      dataset.porMes[dataset.porMes.length - 1]?.monthKey === DATE_TO.slice(0, 7)
  );
  check(
    "Soma das áreas dentro de cada mês = total do mês",
    dataset.porMes.every(
      (month) =>
        Object.values(month.porArea).reduce((sum, cell) => sum + cell.total, 0) === month.geral.total
    )
  );

  // ---- 3. Colaboradores --------------------------------------------
  console.log("\nCOLABORADORES");
  check(
    "12. \"SEM RESPONSÁVEL\" não aparece como colaborador",
    dataset.colaboradores.every((group) => group.rows.every((row) => row.responsavel !== "SEM RESPONSÁVEL"))
  );
  check(
    "11. Ranking + sem-responsável = total da área",
    dataset.colaboradores.every(
      (group) => group.rows.reduce((sum, row) => sum + row.total, 0) + group.semResponsavel === group.totals.total
    )
  );
  check(
    "Ranking ordenado por aderência, empate pelo volume",
    dataset.colaboradores.every((group) =>
      group.rows.every((row, index) => {
        if (index === 0) return true;
        const previous = group.rows[index - 1];
        const a = previous.aderencia ?? -1;
        const b = row.aderencia ?? -1;
        return a > b || (a === b && previous.total >= row.total);
      })
    )
  );
  check(
    "fechadas + pendentes = total (cada colaborador)",
    dataset.colaboradores.every((group) => group.rows.every((row) => row.fechadas + row.pendentes === row.total))
  );

  for (const group of dataset.colaboradores) {
    console.log(`\n  ${group.label} — ${group.rows.length} colaborador(es), sem responsável: ${group.semResponsavel}`);
    for (const row of group.rows.slice(0, 6)) {
      console.log(
        `    ${row.responsavel.padEnd(30)} ${String(row.fechadas).padStart(4)}/${String(row.total).padEnd(4)}  ${row.aderencia}%`
      );
    }
    if (group.rows.length > 6) console.log(`    … mais ${group.rows.length - 6}`);
  }

  // ---- 4. Conferência contra contagem independente ------------------
  console.log("\nCONFERÊNCIA CONTRA CONTAGEM INDEPENDENTE NO BANCO");
  const independent = await independentCount(DATE_FROM, DATE_TO);
  for (const area of dataset.porArea) {
    const raw = independent[area.area] ?? { total: 0, fechadas: 0 };
    check(
      `${area.label}: total e fechadas conferem`,
      raw.total === area.total && raw.fechadas === area.fechadas,
      `service=${area.total}/${area.fechadas} vs banco=${raw.total}/${raw.fechadas}`
    );
  }

  // ---- 5. Comparação histórica com o PDF de referência --------------
  console.log("\nREFERÊNCIA HISTÓRICA (PDF de agosto/2026 — informativo, não é asserção)");
  const august = await buildAdherenceReportDataset({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    useCurrentFilters: false
  });
  for (const area of august.porArea) {
    const reference = REFERENCE_AUGUST[area.area];
    console.log(
      `  ${area.label.padEnd(10)} base atual ${String(area.fechadas).padStart(4)}/${String(area.total).padEnd(4)} (${area.aderencia}%)   |   PDF de referência ${reference.fechadas}/${reference.total} (${((reference.fechadas / reference.total) * 100).toFixed(1)}%)`
    );
  }
  console.log(
    `  ${"TOTAL".padEnd(10)} base atual ${String(august.geral.fechadas).padStart(4)}/${String(august.geral.total).padEnd(4)} (${august.geral.aderencia}%)   |   PDF de referência ${REFERENCE_AUGUST.TOTAL.fechadas}/${REFERENCE_AUGUST.TOTAL.total} (${((REFERENCE_AUGUST.TOTAL.fechadas / REFERENCE_AUGUST.TOTAL.total) * 100).toFixed(1)}%)`
  );
  console.log(
    "  (A base foi reimportada desde o relatório de referência; os números não são forçados a coincidir.)"
  );

  // ---- 6. PDF -------------------------------------------------------
  console.log("\nPDF");
  const pdf = await renderAdherenceReportPdf(dataset);
  check("13. PDF gerado com assinatura válida", pdf.subarray(0, 5).toString() === "%PDF-", pdf.subarray(0, 8).toString());
  check("PDF não está vazio", pdf.byteLength > 20_000, `${pdf.byteLength} bytes`);

  /**
   * 14. Nenhuma página em branco / cortada.
   *
   * O pdfkit ABRE UMA PÁGINA sozinho quando um texto passa da margem inferior, e
   * isso já produziu um relatório com 10 páginas em branco intercaladas. Aqui o
   * número de páginas do arquivo é comparado com o número que o layout prevê —
   * qualquer página a mais é página fantasma.
   */
  const MONTHS_PER_PAGE = 12;
  const COLLABORATORS_PER_PAGE = 14;
  const pagesFor = (count: number, perPage: number) => Math.max(1, Math.ceil(count / perPage));
  const expectedPages =
    1 + // capa
    1 + // resumo executivo
    pagesFor(dataset.porMes.length, MONTHS_PER_PAGE) + // por mês e por área
    pagesFor(dataset.porMes.length, MONTHS_PER_PAGE) + // abertas x fechadas
    1 + // quantidade por área
    pagesFor(dataset.colaboradores.find((g) => g.area === "MECANICA")?.rows.length ?? 0, COLLABORATORS_PER_PAGE) +
    pagesFor(dataset.colaboradores.find((g) => g.area === "ELETRICA")?.rows.length ?? 0, COLLABORATORS_PER_PAGE) +
    pagesFor(dataset.colaboradores.find((g) => g.area === "TERCEIROS")?.rows.length ?? 0, COLLABORATORS_PER_PAGE) +
    1; // qualidade dos dados

  /**
   * Guarda de glifos: a fonte padrão do PDF é WinAnsi. Um símbolo fora dessa
   * codificação não falha — ele imprime OUTRO caractere, e já imprimiu "+" onde
   * o subtítulo dizia "÷" (invertendo a fórmula na cara do gestor). Aqui o fonte
   * do renderizador é varrido: todo caractere fora do WinAnsi tem de estar no
   * mapa de substituição.
   */
  const CP1252_EXTRA = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
    0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178
  ]);
  const rendererSource = readFileSync(path.join(process.cwd(), "src", "lib", "pdf", "adherence-report.pdf.ts"), "utf8");
  const unmapped = new Set<string>();
  for (const character of rendererSource) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x100 || CP1252_EXTRA.has(code)) continue;
    if (character in GLYPH_FALLBACK) continue;
    unmapped.add(character);
  }
  check(
    "Nenhum glifo fora do WinAnsi sem substituição",
    unmapped.size === 0,
    Array.from(unmapped)
      .map((c) => `${c} (U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`)
      .join(", ")
  );

  const actualPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(
    "14. Sem páginas em branco (contagem bate com o layout)",
    actualPages === expectedPages,
    `PDF tem ${actualPages} página(s), layout prevê ${expectedPages}`
  );
  console.log(`  páginas: ${actualPages}`);

  const outDir = path.join(process.cwd(), "scripts", "out");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, dataset.fileName);
  writeFileSync(outFile, pdf);
  console.log(`  → ${outFile} (${(pdf.byteLength / 1024).toFixed(0)} KB)`);

  console.log(failures === 0 ? "\n✅ Todas as verificações passaram.\n" : `\n❌ ${failures} verificação(ões) falharam.\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
