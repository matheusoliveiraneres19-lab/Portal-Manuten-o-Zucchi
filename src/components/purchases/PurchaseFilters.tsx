"use client";

import { Check, FilterX, Layers, SlidersHorizontal } from "lucide-react";
import { DateRangeFilter } from "@/components/service-orders/filters/DateRangeFilter";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  PURCHASE_DATE_FIELD_LABELS,
  PURCHASE_KIND_FILTER_LABELS,
  PURCHASE_OPERATIONAL_STATUS_LABELS
} from "@/utils/purchase-classification";
import type { PurchaseClassificationOptions, PurchaseFilterOptions } from "@/types/purchases";
import {
  CLASSIFICATION_FILTER_KEYS,
  PURCHASE_KIND_VALUES,
  PURCHASE_PRIORITY_OPTIONS,
  type AppliedPurchaseFilters
} from "@/components/purchases/filters";

type PurchaseFiltersProps = {
  draft: AppliedPurchaseFilters;
  options: PurchaseFilterOptions;
  isPending: boolean;
  onChange: <Key extends keyof AppliedPurchaseFilters>(key: Key, value: AppliedPurchaseFilters[Key]) => void;
  onApply: () => void;
  onClear: () => void;
  /**
   * Opções em cascata dos filtros N1/N2/N3/N4, fornecidas pela aba quando a base
   * importada tem algum nível preenchido. Sem elas a seção de classificação nem
   * é renderizada.
   */
  classificationOptions?: PurchaseClassificationOptions;
  /**
   * Mostra a alternância "Retrato atual" (`latestImportOnly`).
   *
   * Só a aba Compras Realizadas passa `true`: lá o padrão é o histórico completo
   * de todas as importações, e o recorte da última planilha é uma escolha do
   * usuário. Em Compras Pendentes o recorte é FIXO (é a regra da aba), então
   * oferecer o controle sugeriria um desligamento que não existe.
   */
  showSnapshotToggle?: boolean;
  /**
   * Mostra os filtros "Tipo" e "Status", que falam o vocabulário da regra
   * gerencial (serviço Y0008, Y04, ignorado, comprado, entregue...).
   *
   * A aba Compras Pendentes passa `false`: ela segue a regra v3.1 e exibe um
   * único status ("Pendente de Compra"), então oferecer esses filtros só
   * permitiria montar combinações que devolvem lista vazia sem explicação.
   */
  showStatusAndKindFilters?: boolean;
  /**
   * Mostra o filtro "Prioridade" (TAREFA 8) — coluna "Nº acompanhamento".
   *
   * Só a aba Compras Pendentes passa `true`: a prioridade orienta a FILA de
   * compra, e em Compras Realizadas o item já foi comprado. Não é oferecido
   * quando a base importada não trouxe a coluna, para não existir um filtro que
   * só sabe devolver lista vazia.
   */
  showPriorityFilter?: boolean;
};

const selectClassName =
  "h-10 w-full rounded-lg border border-gold/15 bg-black/35 px-3 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-gold/55 focus:bg-black/50";
const labelClassName = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400";

const KIND_OPTIONS = PURCHASE_KIND_VALUES.map((value) => ({ value, label: PURCHASE_KIND_FILTER_LABELS[value] ?? value }));
const DATE_FIELD_OPTIONS = Object.entries(PURCHASE_DATE_FIELD_LABELS).map(([value, label]) => ({ value, label }));

export function PurchaseFilters({
  draft,
  options,
  isPending,
  onChange,
  onApply,
  onClear,
  classificationOptions,
  showStatusAndKindFilters = true,
  showSnapshotToggle = false,
  showPriorityFilter = false
}: PurchaseFiltersProps) {
  /**
   * Ao mudar um nível, LIMPA os níveis abaixo dele: uma seleção de N3 herdada de
   * outro N1 deixaria o resultado vazio sem o usuário entender o motivo.
   */
  function handleClassificationChange(key: (typeof CLASSIFICATION_FILTER_KEYS)[number]["key"], values: string[]) {
    onChange(key, values);
    const index = CLASSIFICATION_FILTER_KEYS.findIndex((item) => item.key === key);
    for (const deeper of CLASSIFICATION_FILTER_KEYS.slice(index + 1)) {
      onChange(deeper.key, []);
    }
  }

  return (
    <div className="rounded-lg border border-gold/20 bg-ink p-4 shadow-premium sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-gold">
        <SlidersHorizontal className="h-4 w-4" />
        Filtros do módulo
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <MultiSelectFilter
          label="Fornecedor"
          options={options.suppliers}
          selected={draft.suppliers}
          onChange={(values) => onChange("suppliers", values)}
          placeholder="Todos os fornecedores"
          searchPlaceholder="Buscar fornecedor..."
        />
        <MultiSelectFilter
          label="Categoria (Grupo Merc)"
          options={options.categories}
          selected={draft.categories}
          onChange={(values) => onChange("categories", values)}
          placeholder="Todas as categorias"
          searchPlaceholder="Buscar categoria..."
        />
        <MultiSelectFilter
          label="Grupo Comp"
          options={options.purchasingGroups}
          selected={draft.purchasingGroups}
          onChange={(values) => onChange("purchasingGroups", values)}
          placeholder="Todos os grupos"
          searchPlaceholder="Buscar grupo..."
        />
        {showStatusAndKindFilters && (
          <>
            <MultiSelectFilter
              label="Tipo"
              options={KIND_OPTIONS}
              selected={draft.kinds}
              onChange={(values) => onChange("kinds", values)}
              placeholder="Material, serviço, Y04, ignorado"
            />
            <MultiSelectFilter
              label="Status"
              options={options.statuses.map((status) => ({ value: status, label: PURCHASE_OPERATIONAL_STATUS_LABELS[status] }))}
              selected={draft.statuses}
              onChange={(values) => onChange("statuses", values)}
              placeholder="Todos os status"
              searchPlaceholder="Buscar status..."
            />
          </>
        )}
        {showPriorityFilter && (
          <MultiSelectFilter
            label="Prioridade (Nível requisição)"
            options={PURCHASE_PRIORITY_OPTIONS}
            selected={draft.priorities}
            onChange={(values) => onChange("priorities", values)}
            placeholder="Todas as prioridades"
          />
        )}
        <MultiSelectFilter
          label="Requisitante"
          options={options.requesters.map((requester) => ({ value: requester, label: requester }))}
          selected={draft.requesters}
          onChange={(values) => onChange("requesters", values)}
          placeholder="Todos os requisitantes"
          searchPlaceholder="Buscar requisitante..."
        />

        <label className="block">
          <span className={labelClassName}>Filtrar período por</span>
          <select value={draft.dateField} onChange={(event) => onChange("dateField", event.target.value)} className={selectClassName}>
            <option value="">Data de referência (pedido → requisição)</option>
            {DATE_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="md:col-span-2 xl:col-span-1">
          <DateRangeFilter
            label="Período"
            startDate={draft.startDate}
            endDate={draft.endDate}
            onChange={({ startDate, endDate }) => {
              onChange("startDate", startDate);
              onChange("endDate", endDate);
            }}
          />
        </div>

        <label className="block xl:col-span-3">
          <span className={labelClassName}>Busca livre (material, descrição, fornecedor, requisição, pedido)</span>
          <input
            value={draft.search}
            onChange={(event) => onChange("search", event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onApply()}
            placeholder="Ex.: rolamento, mangueira, motor, 4500123..."
            className={selectClassName}
          />
        </label>
      </div>

      {classificationOptions ? (
        <div className="mt-5 border-t border-gold/10 pt-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            <Layers className="h-3.5 w-3.5" />
            Classificação N1 &rsaquo; N2 &rsaquo; N3 &rsaquo; N4
          </div>
          <div className="grid gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
            {CLASSIFICATION_FILTER_KEYS.map(({ level, key, param }) => {
              const levelOptions = classificationOptions[param];
              const selected = draft[key] as string[];
              return (
                <MultiSelectFilter
                  key={key}
                  label={level}
                  options={levelOptions}
                  selected={selected}
                  onChange={(values) => handleClassificationChange(key, values)}
                  placeholder={levelOptions.length ? `Todos os ${level}` : `Sem ${level} na base`}
                  searchPlaceholder={`Buscar ${level}...`}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Filtros em cascata: escolher um N1 restringe as opções de N2, e assim por diante.
          </p>
        </div>
      ) : null}

      {showSnapshotToggle ? (
        <div className="mt-5 border-t border-gold/10 pt-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={draft.latestImportOnly}
              onChange={(event) => onChange("latestImportOnly", event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
            />
            <span className="text-sm text-zinc-300">
              <span className="font-semibold text-zinc-100">Retrato atual</span> — considerar só as linhas
              presentes na última planilha importada.
              <span className="mt-0.5 block text-[10px] text-zinc-500">
                Desmarcado (padrão), a aba mostra o histórico completo de todas as importações.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-gold/10 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/20 px-4 text-sm font-semibold text-zinc-300 transition hover:border-gold/40 hover:text-white"
        >
          <FilterX className="h-4 w-4" />
          Limpar filtros
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gold/55 bg-gold/15 px-5 text-sm font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {isPending ? "Aplicando..." : "Aplicar filtros"}
        </button>
      </div>
    </div>
  );
}
