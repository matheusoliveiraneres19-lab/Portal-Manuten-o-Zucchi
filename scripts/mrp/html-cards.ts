/** Lê os cartões gerados pelo cardHTML() do HTML de referência (testes da FASE F). */
export type HtmlCard = { title: string; tot: string; extra: string; Comprar: string; Verificar: string; Comprado: string; qtd: string; bars: number[]; target: { area: string; family: string } };

/** Lê os cartões do markup gerado pelo cardHTML() do HTML. */
export function parseCards(html: string): HtmlCard[] {
  return html
    .split('<div class="card"')
    .slice(1)
    .map((chunk) => {
      const onclick = /onclick="filtrarPor\('([^']*)','((?:\\'|[^'])*)'\)"/.exec(chunk)!;
      const title = /<h4[^>]*>([^<]*)<\/h4>/.exec(chunk)![1].replace(/^\S+\s/, "");
      const tot = /<div class="tot">([^<]*)<\/div>/.exec(chunk)![1];
      const [, count, extra = ""] = /^(.*?) materiais(?: · (.*))?$/.exec(tot)!;
      const v = (cls: string) => new RegExp(`<span class="v ${cls}">([^<]*)</span>`).exec(chunk)![1];
      const bars = Array.from(chunk.matchAll(/width:([^%]*)%;background:([^"]*)"/g)).map((m) => Number(m[1]));
      return {
        title,
        tot: count,
        extra,
        Comprar: v("buy"),
        Verificar: v("warn"),
        Comprado: v("comp"),
        qtd: v("qty"),
        bars,
        target: { area: onclick[1], family: onclick[2].replace(/\\'/g, "'") }
      };
    });
}


/* ---- aba Em trânsito (renderTransito) ---- */
export const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const text = (s: string) => unesc(s.replace(/<[^>]+>/g, "")).trim();

export type HtmlRow = { code: string; desc: string; tags: string[]; qtd: string; forn: string; ref: string; date: string; prev: string; badge: string };
export function parseRows(table: string): HtmlRow[] {
  const body = table.split("<tbody>")[1] ?? "";
  return body
    .split("<tr")
    .slice(1)
    .map((tr) => {
      const tds = Array.from(tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((m) => m[1]);
      const tags = Array.from(tds[1].matchAll(/<span class="bg[^"]*"[^>]*>([^<]*)<\/span>/g)).map((m) => unesc(m[1]).replace(/^\S+\s(?=Mec|Elé)/, ""));
      return {
        code: text(tds[0]),
        desc: unesc(/<span class="d">([\s\S]*?)<\/span>/.exec(tds[1])![1]),
        tags,
        qtd: text(tds[2]),
        forn: text(tds[3]),
        ref: text(tds[4]),
        date: text(tds[5]),
        prev: text(tds[6]),
        badge: text(tds[7])
      };
    });
}
export function parseKpis(html: string) {
  const vals = Array.from(html.matchAll(/<div class="val">([^<]*)<\/div>/g)).map((m) => m[1]);
  const subs = Array.from(html.matchAll(/<div class="sub">([^<]*)<\/div>/g)).map((m) => m[1]);
  return { vals, lastSub: subs[subs.length - 1] };
}

