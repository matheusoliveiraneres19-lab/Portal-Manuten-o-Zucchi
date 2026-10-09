/**
 * ANÁLISE MRP — `ALIAS` e `detectCol()` do `Analise_MRP_Compacto (1).html`,
 * portados integralmente. A ORDEM de cada lista importa (a igualdade exata
 * testa os aliases na ordem). Protegido por snapshot em scripts/test-mrp-import.ts.
 */
import { norm } from "./normalization";

export const MRP_ALIASES = {
  cod: ["material", "codigomaterial", "codigo", "codmaterial", "codigodomaterial", "nmaterial", "item", "sku"],
  desc: ["textobrevematerial", "textobrevedopedido", "descricao", "descricaodomaterial", "denominacao", "textobreve", "texto"],
  dep: ["deposito", "dep", "lgort", "localdedeposito", "depositoestoque", "depos"],
  min: ["estoqueminimo", "estoquemin", "minimo", "estminimo", "minimomrp", "minmrp", "pontodepedido", "min"],
  max: ["estoquemaximo", "estoquemax", "maximo", "estmaximo", "maximomrp", "maxmrp", "max"],
  status: ["statusmrp", "statusdomrp", "statusmovimentacao", "movimentacao", "statusmaterial", "saidanoperiodo", "status"],
  grupo: ["grupodemercadorias", "grupomercadorias", "grpmercadorias", "grupodemercadoria", "grupomaterial", "grupo"],
  um: ["unidademedida", "unidadedemedida", "unidade", "umb", "um"],
  livre: [
    "utilizacaolivre",
    "estoquelivre",
    "livreutilizacao",
    "qtdutilizacaolivre",
    "quantidadelivre",
    "qtdlivre",
    "disponivel",
    "estoquedisponivel",
    "saldolivre",
    "livre"
  ],
  qtd: ["quantid", "quantidade", "qtd", "qtde", "quantidadepedida", "quant"],
  data: ["datadarequisicao", "datarequisicao", "datadopedido", "datapedido", "datadecriacao", "data"],
  req: ["requisicao", "requisicaodecompra", "numerodarequisicao", "nrequisicao", "rc"],
  ped: ["pedidodecompra", "pedidocompra", "numerodopedido", "npedido", "pedido", "oc"],
  rec: ["datarecebimento", "datadorecebimento", "dataderecebimento", "recebimento", "dataentrega"],
  prev: ["previsaodeentrega", "previsaoentrega", "previsaodaentrega", "dataprevista", "previsao"],
  forn: ["descricaofornecedor", "nomefornecedor", "fornecedor", "razaosocial"]
} as const satisfies Record<string, readonly string[]>;

export type MrpAliasField = keyof typeof MRP_ALIASES;

/**
 * `detectCol()` — índice da coluna do campo, ou -1.
 *   1. igualdade exata, testando os aliases NA ORDEM da lista;
 *   2. senão, cabeçalho (com 3+ caracteres) que CONTÉM o alias, testando os
 *      aliases do mais longo para o mais curto e as colunas da esquerda para a
 *      direita.
 */
export function detectCol(headers: readonly unknown[], field: MrpAliasField): number {
  const H = headers.map(norm),
    cands: readonly string[] = MRP_ALIASES[field];
  for (const c of cands) {
    const i = H.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of [...cands].sort((a, b) => b.length - a.length))
    for (let i = 0; i < H.length; i++) if (H[i] && H[i].length >= 3 && H[i].includes(c)) return i;
  return -1;
}
