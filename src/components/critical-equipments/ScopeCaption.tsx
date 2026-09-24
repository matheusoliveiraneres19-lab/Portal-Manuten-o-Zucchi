/**
 * Linha de recorte sob o título dos dashboards de Equipamentos Críticos
 * ("MULTIFIO 04 BM · Agosto/2026"). Sem seleção ativa não renderiza nada — o
 * título sozinho já significa "recorte geral da página".
 */
export function ScopeCaption({ label }: { label?: string | null }) {
  if (!label) {
    return null;
  }
  return (
    <p className="text-[11px] font-semibold text-petroleum" title="Recorte da análise atual">
      {label}
    </p>
  );
}

/**
 * Estado vazio de um recorte selecionado. Nunca cai para o total geral: se a
 * máquina não tem dado, o gráfico diz isso.
 */
export const SCOPED_EMPTY_TITLE = "Sem dados para o recorte atual";
export const SCOPED_EMPTY_DESCRIPTION = "Sem registros para esta seleção no período selecionado.";
