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

